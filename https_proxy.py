import http.server
import ssl
import socketserver
import urllib.request
import urllib.error

PORT = 8443
BACKEND_PORT = 4174
CERT_FILE = "E:/消费记账软件/bill-analyzer/static/localhost.crt"
KEY_FILE = "E:/消费记账软件/bill-analyzer/static/localhost.key"

class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def _proxy(self, method):
        body = None
        if method in ('POST', 'PUT'):
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length) if length > 0 else None
        
        target = f"http://127.0.0.1:{BACKEND_PORT}{self.path}"
        headers = {k: v for k, v in self.headers.items() 
                   if k.lower() not in ('host', 'transfer-encoding', 'connection')}
        headers['Host'] = f'localhost:{PORT}'
        
        try:
            req = urllib.request.Request(target, data=body, method=method)
            for k, v in headers.items():
                req.add_header(k, v)
            resp = urllib.request.urlopen(req, timeout=30)
            self.send_response(resp.status)
            for k, v in resp.getheaders():
                if k.lower() not in ('transfer-encoding', 'connection'):
                    self.send_header(k, v)
            self.end_headers()
            self.wfile.write(resp.read())
        except urllib.error.HTTPError as e:
            self.send_error(e.code, str(e.reason))
        except Exception as e:
            self.send_error(502, f"Proxy error: {e}")
    
    def do_GET(self):    self._proxy('GET')
    def do_POST(self):   self._proxy('POST')
    def do_PUT(self):    self._proxy('PUT')
    def do_DELETE(self): self._proxy('DELETE')
    def log_message(self, format, *args): pass

server = ThreadedHTTPServer(('0.0.0.0', PORT), ProxyHandler)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(certfile=CERT_FILE, keyfile=KEY_FILE)
ctx.check_hostname = False
server.socket = ctx.wrap_socket(server.socket, server_side=True)
print(f"HTTPS proxy at https://localhost:{PORT}/")
print(f"LAN: https://172.20.10.4:{PORT}/")
server.serve_forever()
