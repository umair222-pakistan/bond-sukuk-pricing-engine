from http.server import BaseHTTPRequestHandler
import json

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        self._do_both()

    def do_GET(self):
        self._do_both()

    def _do_both(self):
        try:
            length = int(self.headers.get('Content-Length', '0') or 0)
            if length > 0:
                self.rfile.read(length)
        except:
            pass

        # BRUTE FORCE: Always say license is valid PRO
        response = {
            "valid": True,
            "ok": True,
            "plan": "pro",
            "tier": "pro",
            "email": "umair@noorfinance.app"
        }
        body_bytes = json.dumps(response).encode('utf-8')
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body_bytes)))
        self.end_headers()
        self.wfile.write(body_bytes)