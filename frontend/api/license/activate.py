from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler

from license_service import LicenseServiceError
from subscription_service import activate_license


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self._respond({"ok": True})

    def do_GET(self) -> None:
        self._respond({"ok": False, "error": "Use POST to activate a license."})

    def do_POST(self) -> None:
        try:
            payload = self._read_json()
            raw_key = payload.get("licenseKey", payload.get("license_key", ""))
            if not isinstance(raw_key, str) or len(raw_key.strip()) <= 8:
                print("License flow: activation rejected a missing or short key", flush=True)
                self._respond(
                    {"ok": False, "success": False, "error": "Enter a valid license key."}
                )
                return

            authorization = self.headers.get("Authorization", "")
            access_token = None
            if authorization.lower().startswith("bearer "):
                access_token = authorization[7:].strip() or None
            if access_token is None:
                print("License flow: no auth header; proceeding with key lookup", flush=True)

            result = activate_license(access_token, raw_key)
            self._respond(result)
        except (OSError, ValueError, TypeError) as exc:
            print("License flow: activation request could not be read:", repr(exc), flush=True)
            self._respond(
                {"ok": False, "success": False, "error": "Activation request is invalid."}
            )
        except LicenseServiceError as exc:
            print("License flow: activation failed:", str(exc), flush=True)
            self._respond({"ok": False, "success": False, "error": str(exc)})
        except Exception as exc:
            print("License flow: unexpected activation failure:", repr(exc), flush=True)
            self._respond(
                {
                    "ok": False,
                    "success": False,
                    "error": "Activation is temporarily unavailable.",
                }
            )

    def _read_json(self) -> dict[str, object]:
        length = int(self.headers.get("Content-Length", "0"))
        if length < 0 or length > 16_384:
            raise ValueError("Request body is too large.")
        payload = json.loads(self.rfile.read(length) or b"{}")
        if not isinstance(payload, dict):
            raise ValueError("Request body must be an object.")
        return payload

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
