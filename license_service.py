from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class LicenseServiceError(Exception):
    pass


def _settings() -> tuple[str, str, str]:
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    anon_key = os.environ.get("SUPABASE_ANON_KEY", "")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not anon_key or not service_role_key:
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


def _request_json(request: Request) -> object:
    try:
        with urlopen(request, timeout=10) as response:
            body = response.read()
    except HTTPError as exc:
        if exc.code in (401, 403):
            raise LicenseServiceError("Authentication failed.") from exc
        raise LicenseServiceError("License service request failed.") from exc
    except (TimeoutError, URLError) as exc:
        raise LicenseServiceError("License service is temporarily unavailable.") from exc

    if not body:
        return None

    try:
        return json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise LicenseServiceError("License service returned an invalid response.") from exc


def authenticated_user_email(access_token: str) -> str:
    supabase_url, anon_key, _ = _settings()
    request = Request(
        f"{supabase_url}/auth/v1/user",
        headers={
            "apikey": anon_key,
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        },
    )
    user = _request_json(request)
    if not isinstance(user, dict) or not isinstance(user.get("email"), str):
        raise LicenseServiceError("Authenticated account has no email address.")
    return user["email"].strip().lower()


def active_license_for_email(email: str) -> bool:
    supabase_url, _, service_role_key = _settings()
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
