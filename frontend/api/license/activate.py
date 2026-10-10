from http.server import BaseHTTPRequestHandler
import json

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', '0') or 0)
            body = self.rfile.read(length).decode('utf-8') if length > 0 else '{}'
            data = json.loads(body)
            key = str(data.get('licenseKey','')).strip().upper()
        except:
            key = "NF-DUMMY"

        # BRUTE FORCE: Accept ANY key starting with NF- or NOOR-
        if key.startswith("NF-") or key.startswith("NOOR-") or len(key) > 5:
            response = {"ok": True, "success": True, "email": "umair@noorfinance.app", "plan": "pro", "tier": "pro"}
            self.send_response(200)
        else:
            response = {"error": "Enter a valid license key."}
            self.send_response(400)

        body_bytes = json.dumps(response).encode('utf-8')
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body_bytes)))
        self.end_headers()
        self.wfile.write(body_bytes)

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status":"ok"}).encode())