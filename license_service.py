from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


class LicenseServiceError(Exception):
    pass


def _settings() -> tuple[str, str, str]:
    supabase_url = (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    ).rstrip("/")
    anon_key = os.environ.get("SUPABASE_ANON_KEY", "")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_role_key:
        raise LicenseServiceError("License service is not configured.")
    return supabase_url, anon_key, service_role_key


def configured_product_ids() -> set[str]:
    product_ids = {
        product_id.strip()
        for product_id in os.environ.get("LEMONSQUEEZY_PRODUCT_IDS", "").split(",")
        if product_id.strip()
    }
    if not product_ids:
        raise LicenseServiceError("Lemon Squeezy product IDs are not configured.")
    return product_ids


def configured_product_plans() -> dict[str, str]:
    plans = {
        product_id.strip(): plan
        for plan, variable in (
            ("basic", "LEMONSQUEEZY_BASIC_PRODUCT_ID"),
            ("pro", "LEMONSQUEEZY_PRO_PRODUCT_ID"),
            ("enterprise", "LEMONSQUEEZY_ENTERPRISE_PRODUCT_ID"),
        )
        if (product_id := os.environ.get(variable, "").strip())
    }
    if len(plans) != 3:
        raise LicenseServiceError("Lemon Squeezy plan product IDs are not fully configured.")
    return plans


def _request_json(request: Request, *, log_result: bool = False) -> object:
    try:
        with urlopen(request, timeout=10) as response:
            body = response.read()
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        if log_result:
            print(
                "Supabase result:",
                None,
                {"status": exc.code, "error": error_body},
            )
        if exc.code in (401, 403):
            raise LicenseServiceError("Authentication failed.") from exc
        raise LicenseServiceError("License service request failed.") from exc
    except (TimeoutError, URLError) as exc:
        if log_result:
            print("Supabase result:", None, str(exc))
        raise LicenseServiceError("License service is temporarily unavailable.") from exc

    if not body:
        if log_result:
            print("Supabase result:", None, None)
        return None

    try:
        data = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        if log_result:
            print("Supabase result:", None, str(exc))
        raise LicenseServiceError("License service returned an invalid response.") from exc
    if log_result:
        print("Supabase result:", data, None)
    return data


def authenticated_user(access_token: str) -> tuple[str, str]:
    supabase_url, anon_key, _ = _settings()
    if not anon_key:
        raise LicenseServiceError("Supabase anon key is not configured.")
    request = Request(
        f"{supabase_url}/auth/v1/user",
        headers={
            "apikey": anon_key,
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        },
    )
    user = _request_json(request)
    if (
        not isinstance(user, dict)
        or not isinstance(user.get("id"), str)
        or not isinstance(user.get("email"), str)
    ):
        raise LicenseServiceError("Authenticated account has no ID or email address.")
    return user["id"], user["email"].strip().lower()


def authenticated_account_for_id(user_id: str) -> tuple[str, str]:
    supabase_url, _, service_role_key = _settings()
    request = Request(
        f"{supabase_url}/auth/v1/admin/users/{quote(user_id, safe='')}",
        headers={
            "apikey": service_role_key,
            "Authorization": f"******",
            "Accept": "application/json",
        },
    )
    account = _request_json(request)
    if isinstance(account, dict) and isinstance(account.get("user"), dict):
        account = account["user"]
    if (
        not isinstance(account, dict)
        or str(account.get("id", "")) != user_id
        or not isinstance(account.get("email"), str)
    ):
        raise LicenseServiceError("Checkout account could not be verified.")
    return user_id, account["email"].strip().lower()


def active_license_for_email(email: str) -> bool:
    supabase_url, _, service_role_key = _settings()
    query = urlencode(
        {
            "email": f"ilike.{email}",
            "status": "eq.active",
            "select": "email",
            "limit": "1",
        }
    )
    request = Request(
        f"{supabase_url}/rest/v1/licenses?{query}",
        headers={
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Accept": "application/json",
        },
    )
    rows = _request_json(request)
    if not isinstance(rows, list):
        raise LicenseServiceError("License service returned an invalid response.")
    if any(
        isinstance(row, dict)
        and isinstance(row.get("email"), str)
        and row["email"].strip().lower() == email.strip().lower()
        for row in rows
    ):
        return True

    query = urlencode(
        {
            "user_email": f"eq.{email}",
            "status": "eq.active",
            "select": "expires_at",
        }
    )
    request = Request(
        f"{supabase_url}/rest/v1/noorfinance_licenses?{query}",
        headers={
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Accept": "application/json",
        },
    )
    rows = _request_json(request)
    if not isinstance(rows, list):
        raise LicenseServiceError("License service returned an invalid response.")

    now = datetime.now(timezone.utc)
    for row in rows:
        if not isinstance(row, dict):
            continue
        expires_at = row.get("expires_at")
        if expires_at is None:
            return True
        if not isinstance(expires_at, str):
            continue
        try:
            expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except ValueError:
            continue
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if expiry > now:
            return True
    return False


def activate_license(access_token: str, license_key: str) -> str:
    user_id, email = authenticated_user(access_token)
    license_key = license_key.strip().upper()
    print("Activate attempt:", email, license_key)
    supabase_url, _, service_role_key = _settings()
    query = urlencode(
        {
            "license_key": f"eq.{license_key}",
            "status": "eq.active",
            "select": "*",
            "limit": "2",
        }
    )
    request = Request(
        f"{supabase_url}/rest/v1/licenses?{query}",
        headers={
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Accept": "application/json",
        },
    )
    rows = _request_json(request, log_result=True)
    if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict):
        raise LicenseServiceError("License key is invalid or inactive.")

    license_record = rows[0]
    assigned_user_id = license_record.get("user_id")
    if assigned_user_id is not None and assigned_user_id != user_id:
        raise LicenseServiceError("License key is invalid or inactive.")

    if assigned_user_id is None:
        update_query = urlencode(
            {
                "license_key": f"eq.{license_key}",
                "status": "eq.active",
                "user_id": "is.null",
                "select": "user_id",
            }
        )
        update_request = Request(
            f"{supabase_url}/rest/v1/licenses?{update_query}",
            data=json.dumps({"user_id": user_id}).encode("utf-8"),
            headers={
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
            method="PATCH",
        )
        updated_rows = _request_json(update_request, log_result=True)
        if (
            not isinstance(updated_rows, list)
            or len(updated_rows) != 1
            or not isinstance(updated_rows[0], dict)
            or updated_rows[0].get("user_id") != user_id
        ):
            raise LicenseServiceError("License key is invalid or inactive.")

    return email


def active_profile_for_user(user_id: str) -> bool:
    supabase_url, _, service_role_key = _settings()
    query = urlencode({"id": f"eq.{user_id}", "select": "is_pro,subscription_status"})
    request = Request(
        f"{supabase_url}/rest/v1/profiles?{query}",
        headers={
            "apikey": service_role_key,
            "Authorization": f"******",
            "Accept": "application/json",
        },
    )
    rows = _request_json(request)
    if not isinstance(rows, list):
        raise LicenseServiceError("Profile service returned an invalid response.")
    return any(
        isinstance(row, dict)
        and row.get("is_pro") is True
        and row.get("subscription_status") == "active"
        for row in rows
    )


def update_profile_entitlement(
    user_id: str,
    email: str,
    plan: str,
    subscription_status: str,
    is_pro: bool,
) -> None:
    supabase_url, _, service_role_key = _settings()
    payload = {
        "id": user_id,
        "email": email,
        "plan": plan,
        "is_pro": is_pro,
        "subscription_status": subscription_status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    request = Request(
        f"{supabase_url}/rest/v1/profiles?on_conflict=id",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": service_role_key,
            "Authorization": f"******",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation",
        },
        method="POST",
    )
    rows = _request_json(request)
    if not isinstance(rows, list) or not rows:
        raise LicenseServiceError("Profile entitlement could not be saved.")


def update_profile_plan_for_email(
    email: str,
    plan: str,
    customer_id: str | None,
) -> None:
    supabase_url, _, service_role_key = _settings()
    query = urlencode({"email": f"eq.{email}"})
    payload: dict[str, object] = {
        "plan": plan,
    }
    if customer_id:
        payload["lemon_customer_id"] = customer_id
    request = Request(
        f"{supabase_url}/rest/v1/profiles?{query}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": service_role_key,
            "Authorization": f"******",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        method="PATCH",
    )
    rows = _request_json(request)
    if not isinstance(rows, list) or not rows:
        raise LicenseServiceError("No profile matched the paid checkout email.")


def upsert_paid_order(
    email: str,
    plan: str,
    status: str,
    order_id: str,
) -> None:
    supabase_url, _, service_role_key = _settings()
    payload = {
        "email": email,
        "plan": plan,
        "status": status,
        "lemon_order_id": order_id,
    }
    request = Request(
        f"{supabase_url}/rest/v1/licenses?on_conflict=lemon_order_id",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": service_role_key,
            "Authorization": f"******",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation",
        },
        method="POST",
    )
    rows = _request_json(request)
    if not isinstance(rows, list) or not rows:
        raise LicenseServiceError("Paid order could not be saved.")


def upsert_license(attributes: dict[str, object], license_key_id: str, status: str) -> None:
    supabase_url, _, service_role_key = _settings()
    email = attributes.get("user_email")
    if not isinstance(email, str) or not email.strip():
        raise LicenseServiceError("License key event is missing the customer email.")

    expires_at = attributes.get("expires_at")
    if expires_at is not None and not isinstance(expires_at, str):
        raise LicenseServiceError("License key event contains an invalid expiry.")

    payload = {
        "license_key_id": license_key_id,
        "user_email": email.strip().lower(),
        "status": status,
        "expires_at": expires_at,
        "product_id": str(attributes["product_id"]) if attributes.get("product_id") is not None else None,
        "order_id": str(attributes["order_id"]) if attributes.get("order_id") is not None else None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    request = Request(
        f"{supabase_url}/rest/v1/noorfinance_licenses?on_conflict=license_key_id",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        method="POST",
    )
    _request_json(request)
