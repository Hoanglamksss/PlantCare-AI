from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from threading import BoundedSemaphore

from screening import PhotoError, analyze_photo, prepare_photo


MAX_BODY = 8 * 1024 * 1024
SLOTS = BoundedSemaphore(2)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        return

    def send_payload(self, status: int, content_type: str, payload: bytes):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def send_json(self, status: int, value: dict):
        self.send_payload(status, "application/json", json.dumps(value, ensure_ascii=False).encode("utf-8"))

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"status": "ok"})
        else:
            self.send_json(404, {"code": "NOT_FOUND"})

    def do_POST(self):
        if self.path not in ("/prepare", "/analyze"):
            self.send_json(404, {"code": "NOT_FOUND"})
            return
        length = self.headers.get("Content-Length", "")
        if not length.isascii() or not length.isdigit() or len(length) > 8:
            self.send_json(400, {"code": "INVALID_IMAGE"})
            return
        size = int(length)
        if size < 1 or size > MAX_BODY:
            self.send_json(413, {"code": "IMAGE_TOO_LARGE"})
            return
        if not SLOTS.acquire(blocking=False):
            self.send_json(503, {"code": "SCREENING_BUSY"})
            return
        try:
            self.connection.settimeout(12)
            payload = self.rfile.read(size)
            if len(payload) != size:
                self.send_json(422, {"code": "INVALID_IMAGE"})
                return
            if self.path == "/prepare":
                self.send_payload(200, "image/jpeg", prepare_photo(payload))
            else:
                self.send_json(200, analyze_photo(payload))
        except PhotoError as error:
            self.send_json(error.status, {"code": error.code})
        except (TimeoutError, ConnectionResetError):
            self.close_connection = True
        except Exception:
            self.send_json(500, {"code": "SCREENING_FAILED"})
        finally:
            SLOTS.release()


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
