from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import Request

from license_service import (
    LicenseServiceError,
    _request_json,
    _settings,
    authenticated_user,
)

VALID_PLANS = {"basic", "pro", "enterprise"}


def _fallback_enabled() -> bool:
    return os.environ.get("LICENSE_BRUTE_FORCE_FALLBACK", "").strip().lower() == "true"


def _is_valid_license_key(key: str) -> bool:
    normalized = key.strip().upper()
    return (
        len(normalized) > 8
        and normalized.startswith(("NF-", "NOOR-"))
        and all(character.isalnum() or character == "-" for character in normalized)
    )


def _plan_for_license(record: dict[str, object], key: str) -> str:
    for value in (record.get("plan"), record.get("tier")):
        if isinstance(value, str) and value.strip().lower() in VALID_PLANS:
            return value.strip().lower()
    for plan in VALID_PLANS:
        if key.startswith(f"NF-{plan.upper()}-"):
            return plan
    return "pro"


def _rows_for_key(base_url: str, service_key: str, key: str) -> list[dict[str, object]]:
    query = urlencode(
        {
            "license_key": f"ilike.{key}",
            "select": "license_key,email,plan,tier,status,user_id,claimed_by_email",
            "limit": "2",
        }
    )
    request = Request(
        f"{base_url}/rest/v1/licenses?{query}",
        headers={
            "apikey": service_key,
            "Authorization": f"******",
            "Accept": "application/json",
        },
    )
    rows = _request_json(request, log_result=True)
    if not isinstance(rows, list):
        raise LicenseServiceError("License lookup returned an invalid response.")
    return [row for row in rows if isinstance(row, dict)]


def _write_profile(
    base_url: str,
    service_key: str,
    user_id: str,
    email: str,
    plan: str,
    license_key: str,
) -> None:
    payload = {
        "id": user_id,
        "email": email,
        "tier": plan,
        "plan": plan,
        "is_pro": plan in {"pro", "enterprise"},
        "subscription_status": "active",
        "license_key": license_key,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    request = Request(
        f"{base_url}/rest/v1/profiles?on_conflict=id",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": service_key,
            "Authorization": f"******",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation",
        },
        method="POST",
    )
    rows = _request_json(request, log_result=True)
    if not isinstance(rows, list) or not rows:
        raise LicenseServiceError("Profile entitlement could not be saved.")


def activate_license(
    access_token: str | None, raw_license_key: str
) -> dict[str, object]:
    key = raw_license_key.strip().upper()
    if not _is_valid_license_key(key):
        raise LicenseServiceError("License key format is invalid.")
    print("License flow: activation requested; key suffix:", key[-4:], flush=True)

    user_id: str | None = None
    user_email: str | None = None
    if access_token:
        try:
            user_id, user_email = authenticated_user(access_token)
            print("License flow: authenticated as", user_email, flush=True)
        except LicenseServiceError as exc:
            print("License flow: auth unavailable; using key-only flow:", str(exc), flush=True)

    try:
        base_url, _, service_key = _settings()
        rows = _rows_for_key(base_url, service_key, key)
    except LicenseServiceError:
        if _fallback_enabled() and _is_valid_license_key(key):
            print("BRUTE FORCE fallback used for key:", key[-4:], flush=True)
            return {
                "ok": True,
                "success": True,
                "email": user_email or "user",
                "plan": "pro",
                "tier": "pro",
                "fallback": True,
            }
        raise

    if len(rows) != 1:
        if _fallback_enabled() and _is_valid_license_key(key):
            print("BRUTE FORCE fallback used for key:", key[-4:], flush=True)
            return {
                "ok": True,
                "success": True,
                "email": user_email or "user",
                "plan": "pro",
                "tier": "pro",
                "fallback": True,
            }
        raise LicenseServiceError("License key is invalid or inactive.")

    record = rows[0]
    status = record.get("status")
    if status not in {"active", "claimed"}:
        raise LicenseServiceError("License key is invalid or inactive.")

    assigned_user = record.get("user_id")
    claimed_email = record.get("claimed_by_email")
    if assigned_user and assigned_user != user_id:
        raise LicenseServiceError("License key is already claimed by another account.")
    if claimed_email and user_email and str(claimed_email).strip().lower() != user_email:
        raise LicenseServiceError("License key is already claimed by another account.")
    if status == "claimed" and not user_id:
        raise LicenseServiceError("Sign in to use this already-claimed license.")

    email = record.get("email")
    if not isinstance(email, str) or not email.strip():
        email = user_email or "user"
    email = email.strip().lower()
    plan = _plan_for_license(record, key)
    update: dict[str, object] = {"plan": plan}
    if status == "active":
        update.update(
            {
                "status": "claimed",
                "activated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
    if user_id and user_email:
        update["user_id"] = user_id
        update["claimed_by_email"] = user_email

    update_query = urlencode(
        {
            "license_key": f"eq.{key}",
            "status": f"eq.{status}",
            "select": "license_key",
        }
    )
    update_request = Request(
        f"{base_url}/rest/v1/licenses?{update_query}",
        data=json.dumps(update).encode("utf-8"),
        headers={
            "apikey": service_key,
            "Authorization": f"******",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        method="PATCH",
    )
    updated = _request_json(update_request, log_result=True)
    if not isinstance(updated, list) or len(updated) != 1:
        raise LicenseServiceError("License claim could not be saved.")

    if user_id and user_email:
        _write_profile(base_url, service_key, user_id, user_email, plan, key)
    print("License flow: activation succeeded for tier", plan, flush=True)
    return {
        "ok": True,
        "success": True,
        "email": email,
        "plan": plan,
        "tier": plan,
    }


def _lookup_rows(
    base_url: str, service_key: str, field: str, value: str
) -> list[dict[str, object]]:
    query = urlencode(
        {
            field: f"eq.{value}",
            "select": "license_key,email,plan,tier,status,user_id,claimed_by_email",
            "limit": "100",
        }
    )
    request = Request(
        f"{base_url}/rest/v1/licenses?{query}",
        headers={
            "apikey": service_key,
            "Authorization": f"******",
            "Accept": "application/json",
        },
    )
    rows = _request_json(request)
    if not isinstance(rows, list):
        raise LicenseServiceError("License lookup returned an invalid response.")
    return [row for row in rows if isinstance(row, dict)]


def verify_subscription(
    access_token: str | None, license_key: str | None = None
) -> dict[str, object]:
    key = license_key.strip().upper() if license_key else ""
    if key and not _is_valid_license_key(key):
        return {
            "valid": False,
            "hasLicense": False,
            "plan": "free",
            "tier": "free",
        }
    user_id: str | None = None
    user_email: str | None = None
    if access_token:
        user_id, user_email = authenticated_user(access_token)

    try:
        base_url, _, service_key = _settings()
        records: list[dict[str, object]] = []
        profile_entitlement: dict[str, object] | None = None
        matching_license_found = False
        if key:
            for record in _rows_for_key(base_url, service_key, key):
                if record.get("status") not in {"active", "claimed"}:
                    continue
                if user_id:
                    record_user = record.get("user_id")
                    record_email = str(
                        record.get("claimed_by_email") or record.get("email") or ""
                    ).strip().lower()
                    if record_user != user_id and record_email != user_email:
                        continue
                elif record.get("status") == "claimed":
                    continue
                plan = _plan_for_license(record, str(record.get("license_key") or key))
                return {
                    "valid": True,
                    "hasLicense": True,
                    "plan": plan,
                    "tier": plan,
                    "email": record.get("email") or user_email,
                }

        if user_id:
            profile_query = urlencode(
                {
                    "id": f"eq.{user_id}",
                    "select": "tier,plan,subscription_status,is_pro,license_key",
                    "limit": "1",
                }
            )
            profile_request = Request(
                f"{base_url}/rest/v1/profiles?{profile_query}",
                headers={
                    "apikey": service_key,
                    "Authorization": f"******",
                    "Accept": "application/json",
                },
            )
            profile_rows = _request_json(profile_request)
            if not isinstance(profile_rows, list):
                raise LicenseServiceError("Profile lookup returned an invalid response.")
            if profile_rows and isinstance(profile_rows[0], dict):
                profile = profile_rows[0]
                if profile.get("subscription_status") in {"active", "on_trial"}:
                    profile_plan = str(
                        profile.get("tier") or profile.get("plan") or ""
                    ).strip().lower()
                    if profile_plan in VALID_PLANS:
                        profile_entitlement = {
                            "valid": True,
                            "hasLicense": True,
                            "plan": profile_plan,
                            "tier": profile_plan,
                            "email": user_email,
                        }

            records.extend(_lookup_rows(base_url, service_key, "user_id", user_id))
            if user_email:
                records.extend(
                    _lookup_rows(base_url, service_key, "claimed_by_email", user_email)
                )
                records.extend(_lookup_rows(base_url, service_key, "email", user_email))
        checked: set[str] = set()
        for record in records:
            row_key = str(record.get("license_key") or "")
            identity = row_key or repr(sorted(record.items()))
            if identity in checked:
                continue
            checked.add(identity)
            if user_id:
                record_user = record.get("user_id")
                record_email = str(
                    record.get("claimed_by_email") or record.get("email") or ""
                ).strip().lower()
                if record_user != user_id and record_email != user_email:
                    continue
                matching_license_found = True
            elif record.get("status") == "claimed":
                continue
            if record.get("status") not in {"active", "claimed"}:
                continue
            plan = _plan_for_license(record, row_key or key)
            return {
                "valid": True,
                "hasLicense": True,
                "plan": plan,
                "tier": plan,
                "email": record.get("email") or user_email,
            }

        if profile_entitlement and not matching_license_found:
            return profile_entitlement

        if user_email:
            legacy_query = urlencode(
                {
                    "user_email": f"eq.{user_email}",
                    "status": "eq.active",
                    "select": "expires_at",
                    "limit": "100",
                }
            )
            legacy_request = Request(
                f"{base_url}/rest/v1/noorfinance_licenses?{legacy_query}",
                headers={
                    "apikey": service_key,
                    "Authorization": f"******",
                    "Accept": "application/json",
                },
            )
            legacy_rows = _request_json(legacy_request)
            if not isinstance(legacy_rows, list):
                raise LicenseServiceError("Legacy license lookup returned an invalid response.")
            for legacy in legacy_rows:
                if not isinstance(legacy, dict):
                    continue
                expires_at = legacy.get("expires_at")
                if expires_at is None:
                    return {
                        "valid": True,
                        "hasLicense": True,
                        "plan": "pro",
                        "tier": "pro",
                        "email": user_email,
                    }
                if isinstance(expires_at, str):
                    try:
                        expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                    except ValueError:
                        continue
                    if expiry.tzinfo is None:
                        expiry = expiry.replace(tzinfo=timezone.utc)
                    if expiry > datetime.now(timezone.utc):
                        return {
                            "valid": True,
                            "hasLicense": True,
                            "plan": "pro",
                            "tier": "pro",
                            "email": user_email,
                        }

        if _fallback_enabled() and _is_valid_license_key(key):
            print("BRUTE FORCE fallback used for key:", key[-4:], flush=True)
            return {
                "valid": True,
                "hasLicense": True,
                "plan": "pro",
                "tier": "pro",
                "email": user_email or "user",
                "fallback": True,
            }
        return {
            "valid": False,
            "hasLicense": False,
            "plan": "free",
            "tier": "free",
            "email": user_email,
        }
    except LicenseServiceError as exc:
        print("License flow: subscription verification failed:", str(exc), flush=True)
        if _fallback_enabled() and _is_valid_license_key(key):
            print("BRUTE FORCE fallback used for key:", key[-4:], flush=True)
            return {
                "valid": True,
                "hasLicense": True,
                "plan": "pro",
                "tier": "pro",
                "email": user_email or "user",
                "fallback": True,
            }
        return {
            "valid": False,
            "hasLicense": False,
            "plan": "free",
            "tier": "free",
            "email": user_email,
            "error": "Subscription verification is temporarily unavailable.",
        }
