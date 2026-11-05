"""Local and Render hosting. Vercel serves public/ and api/analyze.py directly."""
import mimetypes
import os
from pathlib import Path
from wsgiref.simple_server import make_server

from api.analyze import app as analyze_api

PUBLIC = Path(__file__).resolve().parent / "public"


def application(environ, start_response):
    path = environ.get("PATH_INFO", "/")
    if path == "/api/analyze":
        return analyze_api(environ, start_response)
    method = environ["REQUEST_METHOD"]
    if method not in ("GET", "HEAD"):
        start_response("405 Method Not Allowed", [("Allow", "GET, HEAD")])
        return []
    # Public assets are flat. Reject nested paths, dotfiles and directory listing.
    name = "index.html" if path == "/" else path.removeprefix("/")
    if name.startswith(".") or not name or Path(name).name != name or "\x00" in name:
        start_response("404 Not Found", [])
        return []
    resource = PUBLIC / name
    if not resource.is_file():
        start_response("404 Not Found", [])
        return []
    mime = "text/javascript" if resource.suffix in (".mjs", ".js") else mimetypes.guess_type(name)[0]
    start_response("200 OK", [
        ("Content-Type", mime or "application/octet-stream"),
        ("Content-Length", str(resource.stat().st_size)),
        ("X-Content-Type-Options", "nosniff"),
    ])
    return [] if method == "HEAD" else [resource.read_bytes()]


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    with make_server("127.0.0.1", port, application) as httpd:
        print(f"The Bond Desk: http://127.0.0.1:{port}", flush=True)
        httpd.serve_forever()
