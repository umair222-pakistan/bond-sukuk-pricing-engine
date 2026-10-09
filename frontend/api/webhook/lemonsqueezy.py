from __future__ import annotations

import hashlib
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler

from license_service import LicenseServiceError, update_profile_plan_for_email, upsert_paid_order


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._send_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        self._respond(200, {"status": "webhook alive"})

    def do_POST(self) -> None:
        print("Lemon Squeezy webhook POST received.")
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0 or content_length > 1_000_000:
                self._respond(400, {"error": "Invalid webhook payload size."})
                return

            raw_body = self.rfile.read(content_length)
            secret = os.environ.get("LEMONSQUEEZY_WEBHOOK_SECRET", "")
            if not secret:
                self._respond(503, {"error": "Webhook secret is not configured."})
                return

            supplied_signature = self.headers.get("X-Signature", "")
            expected_signature = hmac.new(
                secret.encode("utf-8"),
                raw_body,
                hashlib.sha256,
            ).hexdigest()
            if not hmac.compare_digest(supplied_signature, expected_signature):
                self._respond(401, {"error": "Invalid webhook signature."})
                return

            try:
                payload = json.loads(raw_body)
            except (json.JSONDecodeError, UnicodeDecodeError):
                self._respond(400, {"error": "Invalid webhook JSON."})
                return
            if not isinstance(payload, dict):
                self._respond(400, {"error": "Invalid webhook payload."})
                return

            meta = payload.get("meta")
            custom_data = meta.get("custom_data") if isinstance(meta, dict) else None
            attributes = self._attributes(payload)
            event_name = self.headers.get("X-Event-Name", "")
            if not event_name and isinstance(meta, dict):
                event_name = str(meta.get("event_name", ""))

            data = payload.get("data")
            event_id = data.get("id") if isinstance(data, dict) else None
            email = attributes.get("user_email")
            if not isinstance(email, str) or not email.strip():
                email = custom_data.get("email") if isinstance(custom_data, dict) else None
            if not isinstance(email, str) or not email.strip():
                self._respond(400, {"error": "Webhook payload is missing customer email."})
                return
            email = email.strip().lower()

            print(f"Lemon Squeezy webhook event={event_name}, id={event_id}, email={email}")
            if event_name not in {"order_created", "subscription_created"}:
                self._respond(200, {"ok": True, "ignored": True})
                return

            if event_name == "order_created" and attributes.get("status") != "paid":
                self._respond(200, {"ok": True, "ignored": True})
                return
            if event_name == "subscription_created" and attributes.get("status") not in {
                "active",
                "on_trial",
            }:
                self._respond(200, {"ok": True, "ignored": True})
                return
            if not isinstance(event_id, (str, int)):
                self._respond(400, {"error": "Webhook payload is missing event ID."})
                return

            customer_id = attributes.get("customer_id")
            update_profile_plan_for_email(
                email,
                "basic",
                str(customer_id) if customer_id is not None else None,
            )
            upsert_paid_order(email, "basic", "active", str(event_id))
            print(f"Lemon Squeezy payment applied: email={email}, plan=basic, event_id={event_id}")
            self._respond(200, {"ok": True})
        except LicenseServiceError as exc:
            print(f"Lemon Squeezy webhook database/configuration error: {exc}")
            self._respond(503, {"error": str(exc)})
        except Exception as exc:
            print(f"Lemon Squeezy webhook unexpected error: {exc}")
            self._respond(500, {"error": "Webhook processing failed."})

    @staticmethod
    def _attributes(payload: dict[str, object]) -> dict[str, object]:
        data = payload.get("data")
        if not isinstance(data, dict):
            return {}
        attributes = data.get("attributes")
        return attributes if isinstance(attributes, dict) else {}

    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Signature, X-Event-Name")

    def _respond(self, status: int, payload: dict[str, object]) -> None:
        if status != 200 and status != 204:
            print(f"Lemon Squeezy webhook acknowledging failed event: {payload}")
            payload = {"ok": False, **payload}
            status = 200

        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self._send_cors_headers()
        self.end_headers()
        if body:
            self.wfile.write(body)
