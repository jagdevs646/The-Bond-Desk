"""WSGI entry point shared by the Vercel function and the Render web service."""
import json

from engine import analyze

MAX_BODY = 2_097_152


def respond(start_response, status, payload, extra_headers=()):
    body = json.dumps(payload, allow_nan=False).encode("utf-8")
    start_response(status, [
        ("Content-Type", "application/json; charset=utf-8"),
        ("Content-Length", str(len(body))),
        ("Cache-Control", "no-store"),
        *extra_headers,
    ])
    return [body]


def app(environ, start_response):
    method = environ["REQUEST_METHOD"]
    if method == "GET":
        return respond(start_response, "200 OK", {"status": "ok", "service": "bond-analysis"})
    if method != "POST":
        return respond(start_response, "405 Method Not Allowed",
                       {"error": "Use POST to analyze bonds."}, [("Allow", "GET, POST")])
    if environ.get("CONTENT_TYPE", "").split(";")[0].strip().lower() != "application/json":
        return respond(start_response, "415 Unsupported Media Type", {"error": "Send application/json."})
    try:
        size = int(environ.get("CONTENT_LENGTH") or 0)
        if size > MAX_BODY:
            return respond(start_response, "413 Payload Too Large", {"error": "Request exceeds 2 MiB."})
        if size < 1:
            raise ValueError("Send a JSON body with a valid Content-Length.")
        payload = json.loads(environ["wsgi.input"].read(size))
        if not isinstance(payload, dict) or not isinstance(payload.get("profile"), dict):
            raise ValueError("Supply an investment profile object.")
        bonds = payload.get("bonds")
        if not isinstance(bonds, list) or not 1 <= len(bonds) <= 20 or not all(isinstance(b, dict) for b in bonds):
            raise ValueError("Supply between 1 and 20 bond objects.")
        results = [analyze(b, payload["profile"]) for b in bonds]
        return respond(start_response, "200 OK", results)
    except (ValueError, KeyError, TypeError, ArithmeticError, RecursionError) as error:
        return respond(start_response, "400 Bad Request", {"error": str(error)})
