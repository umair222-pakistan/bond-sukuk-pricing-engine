from __future__ import annotations

import hashlib
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler

from license_service import (
    LicenseServiceError,
    authenticated_account_for_id,
    configured_product_ids,
    update_profile_plan_for_email,
    upsert_paid_order,
    upsert_license,
)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._send_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self) -> None:
        print("Lemon Squeezy webhook POST received.")
        secret = os.environ.get("LEMONSQUEEZY_WEBHOOK_SECRET", "")
        if not secret:
            self._respond(503, {"error": "Webhook is not configured."})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._respond(400, {"error": "Invalid request length."})
            return
        if content_length <= 0 or content_length > 1_000_000:
            self._respond(413, {"error": "Invalid webhook payload size."})
            return

        body = self.rfile.read(content_length)
        supplied_signature = self.headers.get("X-Signature", "")
        expected_signature = hmac.new(
            secret.encode("utf-8"),
            body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(supplied_signature, expected_signature):
            print("Lemon Squeezy webhook rejected: invalid signature.")
            self._respond(401, {"error": "Invalid webhook signature."})
            return

        try:
            payload = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._respond(400, {"error": "Invalid webhook JSON."})
            return

        if not isinstance(payload, dict):
            self._respond(400, {"error": "Invalid webhook payload."})
            return

        event_name = self.headers.get("X-Event-Name", "")
        data = payload.get("data")
        order_id = data.get("id") if isinstance(data, dict) else None
        print(f"Lemon Squeezy webhook received: event={event_name}, id={order_id}")
        if event_name not in {
            "license_key_created",
            "license_key_updated",
            "order_created",
            "order_refunded",
            "subscription_created",
            "subscription_updated",
            "subscription_cancelled",
            "subscription_expired",
        }:
            self._respond(200, {"received": True, "ignored": True})
            return

        attributes = data.get("attributes") if isinstance(data, dict) else None
        if not isinstance(attributes, dict):
            self._respond(400, {"error": "Invalid Lemon Squeezy event."})
            return
        attributes = dict(attributes)
        meta = payload.get("meta")
        custom_data = meta.get("custom_data") if isinstance(meta, dict) else None
        if not isinstance(custom_data, dict):
            custom_data = {}
        email = attributes.get("user_email")
        if not isinstance(email, str) or not email.strip():
            email = custom_data.get("email")
        if isinstance(email, str) and email.strip():
            attributes["user_email"] = email.strip().lower()

        if event_name.startswith("subscription_") or event_name in {"order_created", "order_refunded"}:
            self._handle_profile_event(event_name, attributes, custom_data, order_id)
            return

        license_key_id = data.get("id") if isinstance(data, dict) else None
        if not isinstance(license_key_id, (str, int)):
            self._respond(400, {"error": "Invalid license key event."})
            return

        try:
            allowed_product_ids = configured_product_ids()
        except LicenseServiceError as exc:
            self._respond(503, {"error": str(exc)})
            return

        product_id = attributes.get("product_id")
        if product_id is None or str(product_id) not in allowed_product_ids:
            self._respond(200, {"received": True, "ignored": True})
            return

        if (
            attributes.get("test_mode") is True
            and os.environ.get("LEMONSQUEEZY_ALLOW_TEST_MODE", "").lower() != "true"
        ):
            self._respond(200, {"received": True, "ignored": True})
            return

        status = attributes.get("status")
        if not isinstance(status, str) or status not in {"active", "inactive", "disabled", "expired"}:
            self._respond(400, {"error": "Invalid license key status."})
            return

        try:
            upsert_license(attributes, str(license_key_id), status)
        except LicenseServiceError as exc:
            self._respond(503, {"error": str(exc)})
            return

        self._respond(200, {"received": True})

    def _handle_profile_event(
        self,
        event_name: str,
        attributes: dict[str, object],
        custom_data: dict[str, object],
        event_id: object,
    ) -> None:
        user_id = custom_data.get("user_id")
        email = attributes.get("user_email")
        if not isinstance(email, str) or not email.strip():
            self._respond(400, {"error": "Checkout event is missing the customer email."})
            return
        email = email.strip().lower()

        plan = "basic"

        if (
            attributes.get("test_mode") is True
            and os.environ.get("LEMONSQUEEZY_ALLOW_TEST_MODE", "").lower() != "true"
        ):
            self._respond(200, {"received": True, "ignored": True})
            return

        if isinstance(user_id, str) and user_id.strip():
            try:
                _, verified_email = authenticated_account_for_id(user_id.strip())
            except LicenseServiceError as exc:
                status = 503 if "temporarily unavailable" in str(exc) or "not configured" in str(exc) else 400
                self._respond(status, {"error": str(exc)})
                return
            if verified_email != email:
                self._respond(400, {"error": "Checkout email does not match the authenticated account."})
                return

        event_status = attributes.get("status")
        if event_name == "order_created":
            if event_status != "paid":
                self._respond(200, {"received": True, "ignored": True})
                return
            subscription_status = "active"
            is_pro = True
        elif event_name == "order_refunded":
            subscription_status = "refunded"
            is_pro = False
        elif event_name == "subscription_created":
            if event_status not in {"active", "on_trial"}:
                self._respond(200, {"received": True, "ignored": True})
                return
            subscription_status = "active"
            is_pro = True
        elif event_name == "subscription_updated":
            is_pro = event_status in {"active", "on_trial"}
            subscription_status = "active" if is_pro else str(event_status or "inactive")
        else:
            is_pro = False
            subscription_status = (
                "cancelled" if event_name == "subscription_cancelled"
                else "expired" if event_name == "subscription_expired"
                else str(event_status or "inactive")
            )

        if not isinstance(event_id, (str, int)):
            self._respond(400, {"error": "Lemon Squeezy event is missing its ID."})
            return
        customer_id = attributes.get("customer_id")

        try:
            update_profile_plan_for_email(
                email,
                plan,
                subscription_status,
                is_pro,
                str(customer_id) if customer_id is not None else None,
            )
            upsert_paid_order(
                email,
                plan,
                subscription_status,
                str(event_id),
            )
        except LicenseServiceError as exc:
            print(f"Lemon Squeezy webhook database write failed: {exc}")
            self._respond(503, {"error": str(exc)})
            return

        print(f"Lemon Squeezy webhook processed: event={event_name}, email={email}, plan={plan}")
        self._respond(200, {"ok": True})

    def do_GET(self) -> None:
        self._respond(405, {"error": "Method not allowed."})

    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, X-Signature, X-Event-Name",
        )

    def _respond(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(body)
