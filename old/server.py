import http.server
import mimetypes

# Force Windows to serve JS and WASM with the exact MIME types browsers demand
mimetypes.init()
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('application/wasm', '.wasm')

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Allow cross-origin for local testing
        self.send_header('Access-Control-Allow-Origin', '*')
        # Python 3.8+ SimpleHTTPRequestHandler natively handles Range Requests!
        super().end_headers()

if __name__ == '__main__':
    print("Starting zero-dependency local dev server...")
    print("Serving at: http://localhost:8000")
    http.server.test(HandlerClass=CustomHandler, port=8000)