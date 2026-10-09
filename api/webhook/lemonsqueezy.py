from __future__ import annotations

import hashlib
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler

from license_service import LicenseServiceError, configured_product_ids, upsert_license


class handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
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
        if event_name not in {"license_key_created", "license_key_updated"}:
            self._respond(200, {"received": True, "ignored": True})
            return

        data = payload.get("data")
        attributes = data.get("attributes") if isinstance(data, dict) else None
        license_key_id = data.get("id") if isinstance(data, dict) else None
        if not isinstance(attributes, dict) or not isinstance(license_key_id, (str, int)):
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

    def do_GET(self) -> None:
        self._respond(405, {"error": "Method not allowed."})

    def _respond(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
