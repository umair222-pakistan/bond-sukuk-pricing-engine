from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

from subscription_service import verify_subscription


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self._respond({"valid": False, "plan": "free", "tier": "free"})

    def do_GET(self) -> None:
        query = parse_qs(urlparse(self.path).query)
        license_key = (query.get("licenseKey") or query.get("license_key") or [""])[0]
        self._verify(license_key)

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 0 or length > 16_384:
                raise ValueError("Request body is too large.")
            payload = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(payload, dict):
                raise ValueError("Request body must be an object.")
            license_key = payload.get("licenseKey", payload.get("license_key", ""))
            if not isinstance(license_key, str):
                raise ValueError("License key must be a string.")
            self._verify(license_key)
        except (OSError, ValueError, TypeError) as exc:
            print("License flow: invalid verification request:", repr(exc), flush=True)
            self._respond(
                {
                    "valid": False,
                    "hasLicense": False,
                    "plan": "free",
                    "tier": "free",
                    "error": "Verification request is invalid.",
                }
            )

    def _verify(self, license_key: str) -> None:
        authorization = self.headers.get("Authorization", "")
        access_token = (
            authorization[7:].strip()
            if authorization.lower().startswith("bearer ")
            else None
        )
        try:
            result = verify_subscription(access_token, license_key)
            print("License flow: verification result", result.get("tier"), result.get("valid"), flush=True)
            self._respond(result)
        except Exception as exc:
            print("License flow: verification failed:", repr(exc), flush=True)
            self._respond(
                {
                    "valid": False,
                    "hasLicense": False,
                    "plan": "free",
                    "tier": "free",
                    "error": "Subscription verification is temporarily unavailable.",
                }
            )

    def _respond(self, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
