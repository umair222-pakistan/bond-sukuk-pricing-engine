from __future__ import annotations

import json
import logging
import os
import re
from http.server import BaseHTTPRequestHandler

from license_service import LicenseServiceError, activate_license

logger = logging.getLogger(__name__)


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        self._respond(405, {"error": "Method not allowed."})

    def do_POST(self) -> None:
        logger.info(
            "ENV check: SUPABASE_URL=%s NEXT_PUBLIC_SUPABASE_URL=%s SUPABASE_SERVICE_ROLE_KEY=%s",
            bool(os.environ.get("SUPABASE_URL")),
            bool(os.environ.get("NEXT_PUBLIC_SUPABASE_URL")),
            bool(os.environ.get("SUPABASE_SERVICE_ROLE_KEY")),
        )
        authorization = self.headers.get("Authorization", "")
        if not authorization.startswith("Bearer ") or not authorization[7:].strip():
            self._respond(401, {"error": "Sign in to activate a license."})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._respond(400, {"error": "Invalid request."})
            return
        if content_length <= 0 or content_length > 4096:
            self._respond(400, {"error": "Invalid request."})
            return

        try:
            payload = json.loads(self.rfile.read(content_length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._respond(400, {"error": "Invalid request."})
            return
        if not isinstance(payload, dict):
            self._respond(400, {"error": "Invalid request."})
            return

        license_key = payload.get("licenseKey")
        if not isinstance(license_key, str):
            self._respond(400, {"error": "Enter a valid license key."})
            return
        license_key = license_key.strip().upper()
        logger.info("Activation request received for normalized license key %s", license_key)
        if not re.fullmatch(r"(?=.{8,})(?:NF-|NOOR-)[A-Z0-9]+(?:-[A-Z0-9]+)*", license_key):
            self._respond(400, {"error": "Enter a valid license key."})
            return

        try:
            access_token = authorization[7:].strip()
            email, plan = activate_license(access_token, license_key)
        except LicenseServiceError as exc:
            logger.exception("ACTIVATE FAILED: %s", exc)
            message = str(exc)
            status = (
                401
                if message == "Authentication failed."
                else 503
                if "temporarily unavailable" in message or "not configured" in message
                else 400
            )
            self._respond(status, {"error": message})
            return

        self._respond(200, {"ok": True, "success": True, "email": email, "plan": plan})

    def _respond(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
