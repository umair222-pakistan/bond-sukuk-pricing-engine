from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler

from license_service import (
    LicenseServiceError,
    active_license_for_email,
    authenticated_user_email,
)


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        authorization = self.headers.get("Authorization", "")
        if not authorization.startswith("Bearer ") or not authorization[7:].strip():
            self._respond(401, {"error": "Sign in to check your license."})
            return

        try:
            email = authenticated_user_email(authorization[7:].strip())
            has_license = active_license_for_email(email)
        except LicenseServiceError as exc:
            status = 401 if str(exc) == "Authentication failed." else 503
            self._respond(status, {"error": str(exc)})
            return

        self._respond(200, {"hasLicense": has_license, "email": email})

    def do_POST(self) -> None:
        self._respond(405, {"error": "Method not allowed."})

    def _respond(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
