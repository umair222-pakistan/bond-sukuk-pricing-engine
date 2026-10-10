from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler

from license_service import LicenseServiceError, activate_license


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        self._respond(405, {"ok": False, "error": "Method not allowed"})

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("Request body must be a JSON object")
            raw_key = payload.get("license_key", payload.get("licenseKey", ""))
            license_key = raw_key.strip().upper() if isinstance(raw_key, str) else ""
            print("Activation lookup started; key suffix:", license_key[-4:], flush=True)

            if not license_key:
                print("Activation failed: missing license_key", flush=True)
                self._respond(400, {"ok": False, "error": "License key is required"})
                return

            authorization = self.headers.get("Authorization", "")
            access_token = (
                authorization[7:].strip()
                if authorization.startswith("Bearer ") and authorization[7:].strip()
                else None
            )
            if access_token is None:
                print("No auth header - proceeding with key only", flush=True)
            else:
                print("Authorization header present; validating user", flush=True)

            email, plan = activate_license(access_token, license_key)
            print("Activation completed; plan:", plan, flush=True)
            self._respond(200, {"ok": True, "plan": plan, "email": email})
        except LicenseServiceError as exc:
            print("Activation service error:", str(exc), flush=True)
            status = 404 if str(exc) == "License key is invalid or inactive." else 500
            self._respond(status, {"ok": False, "error": str(exc)})
        except (OSError, ValueError, TypeError, AttributeError) as exc:
            print("Activation lookup failed:", repr(exc), flush=True)
            self._respond(500, {"ok": False, "error": "License lookup failed"})
        except Exception as exc:
            print("Unexpected activation error:", repr(exc), flush=True)
            self._respond(500, {"ok": False, "error": "License lookup failed"})

    def _respond(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
