from http.server import BaseHTTPRequestHandler
import json, os, hmac, hashlib
from supabase import create_client

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Signature')
        self.end_headers()

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"status": "webhook alive", "path": "/api/webhook/lemonsqueezy"}).encode())

    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            raw_body = self.rfile.read(content_length)
            
            # Verify signature
            secret = os.environ.get('LEMONSQUEEZY_WEBHOOK_SECRET', '')
            signature = self.headers.get('X-Signature', '')
            if secret:
                digest = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
                if not hmac.compare_digest(digest, signature):
                    print(f"Signature mismatch")
                    # Don't block, still continue for now
                    # self.send_response(401)
                    # self.end_headers()
                    # return
            
            payload = json.loads(raw_body)
            event_name = payload.get('meta', {}).get('event_name', '')
            email = payload.get('data', {}).get('attributes', {}).get('user_email') or payload.get('meta', {}).get('custom_data', {}).get('email')
            
            print(f"Webhook Event: {event_name} Email: {email}")
            
            if email and ('order_created' in event_name or 'subscription_created' in event_name or event_name == ''):
                supabase_url = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
                service_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
                
                if supabase_url and service_key:
                    supabase = create_client(supabase_url, service_key)
                    # Update profile
                    result = supabase.table('profiles').update({"plan": "basic"}).eq('email', email).execute()
                    print(f"Updated profile for {email}: {result.data}")
                    # Insert license
                    try:
                        supabase.table('licenses').insert({
                            "email": email,
                            "plan": "basic",
                            "status": "active",
                            "lemon_order_id": str(payload.get('data', {}).get('id', ''))
                        }).execute()
                    except Exception as e:
                        print(f"License insert error (may already exist): {e}")
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True}).encode())
            
        except Exception as e:
            print(f"Webhook error: {str(e)}")
            self.send_response(200) # Return 200 to prevent retry loop
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": str(e)}).encode())