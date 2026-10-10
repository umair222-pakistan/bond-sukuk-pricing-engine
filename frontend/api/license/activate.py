from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


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

            supabase_url = (
                os.environ.get("SUPABASE_URL")
                or os.environ.get("VITE_SUPABASE_URL", "")
            ).rstrip("/")
            service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
            print(
                "Supabase env configured:",
                bool(supabase_url),
                bool(service_role_key),
                flush=True,
            )
            if not supabase_url or not service_role_key:
                raise RuntimeError("Supabase URL or service-role key is not configured")

            query = urlencode(
                {
                    "select": "plan",
                    "license_key": f"eq.{license_key}",
                    "status": "eq.active",
                    "limit": "1",
                }
            )
            lookup = Request(
                f"{supabase_url}/rest/v1/licenses?{query}",
                headers={
                    "apikey": service_role_key,
                    "Authorization": f"Bearer {service_role_key}",
                    "Accept": "application/json",
                },
            )
            print("Querying active license by key", flush=True)
            with urlopen(lookup, timeout=10) as response:
                licenses = json.loads(response.read())
            print("License lookup rows:", len(licenses) if isinstance(licenses, list) else "invalid", flush=True)

            if not isinstance(licenses, list) or not licenses:
                count_query = urlencode({"select": "license_key"})
                count_request = Request(
                    f"{supabase_url}/rest/v1/licenses?{count_query}",
                    headers={
                        "apikey": service_role_key,
                        "Authorization": f"Bearer {service_role_key}",
                        "Accept": "application/json",
                        "Prefer": "count=exact",
                        "Range": "0-0",
                    },
                )
                with urlopen(count_request, timeout=10) as response:
                    response.read()
                    content_range = response.headers.get("Content-Range", "")
                total = content_range.rsplit("/", 1)[-1]
                print("Total licenses:", total or "unknown", flush=True)
                self._respond(
                    404,
                    {
                        "ok": False,
                        "error": "License not found",
                        "license_key": license_key,
                    },
                )
                return

            license_record = licenses[0]
            print("Active license found; plan:", license_record.get("plan"), flush=True)
            self._respond(200, {"ok": True, "plan": license_record.get("plan")})
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            print(
                "Supabase HTTP error:",
                exc.code,
                detail or str(exc),
                flush=True,
            )
            self._respond(500, {"ok": False, "error": "License lookup failed"})
        except (URLError, OSError, ValueError, TypeError, AttributeError) as exc:
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
