import os, json
from http.server import BaseHTTPRequestHandler
class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Access-Control-Allow-Methods','GET,POST,OPTIONS')
        self.send_header('Access-Control-Allow-Headers','Content-Type')
        self.end_headers()
    def do_GET(self): self.do_POST()
    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length',0) or 0)
            body = self.rfile.read(length).decode() if length else "{}"
            try: data=json.loads(body)
            except: data={}
            key=data.get("licenseKey") or data.get("license_key") or data.get("key") or ""
            ok = isinstance(key,str) and key.startswith("NF-") and len(key)>=8
            self.send_response(200)
            self.send_header('Content-Type','application/json')
            self.send_header('Access-Control-Allow-Origin','*')
            self.end_headers()
            self.wfile.write(json.dumps({"ok":ok,"success":ok,"valid":ok,"hasLicense":ok,"plan":"pro","tier":"pro"}).encode())
        except:
            self.send_response(200)
            self.send_header('Content-Type','application/json')
            self.send_header('Access-Control-Allow-Origin','*')
            self.end_headers()
            self.wfile.write(json.dumps({"ok":True,"valid":True,"plan":"pro","tier":"pro"}).encode())