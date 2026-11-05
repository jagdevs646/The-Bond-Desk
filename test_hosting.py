"""Exercise the production HTTP contract on both hosting entry points."""
import io
import json
from pathlib import Path
import unittest
from wsgiref.util import setup_testing_defaults

from api.analyze import app
from server import application

SAMPLE = (Path(__file__).resolve().parent / "sample-request.json").read_bytes()


def request(entry, method, path, body=b"", content_type="application/json"):
    env = {}
    setup_testing_defaults(env)
    env.update(REQUEST_METHOD=method, PATH_INFO=path, CONTENT_TYPE=content_type,
               CONTENT_LENGTH=str(len(body)))
    env["wsgi.input"] = io.BytesIO(body)
    response = []
    chunks = entry(env, lambda status, headers: response.extend([status, dict(headers)]))
    return response[0], response[1], b"".join(chunks)


class HostingTests(unittest.TestCase):
    def test_web_and_function(self):
        for entry in (app, application):
            with self.subTest(entry=entry):
                status, _, body = request(entry, "GET", "/api/analyze")
                self.assertEqual(status, "200 OK")
                self.assertEqual(json.loads(body)["status"], "ok")
                status, _, body = request(entry, "POST", "/api/analyze", SAMPLE)
                self.assertEqual(status, "200 OK")
                a, b = json.loads(body)
                self.assertEqual([a["verdict"], b["verdict"]], ["Consider purchase", "Skip"])
                self.assertAlmostEqual(a["price"], 98.5)
                self.assertAlmostEqual(b["price"], 101.5)

    def test_invalid_requests(self):
        for method, body, mime, expected in [
            ("POST", b"{", "application/json", "400"),
            ("POST", b"{}", "application/json", "400"),
            ("POST", SAMPLE, "text/plain", "415"),
            ("POST", b"x" * 65537, "application/json", "413"),
            ("DELETE", b"", "application/json", "405"),
        ]:
            with self.subTest(expected=expected):
                result = request(app, method, "/api/analyze", body, mime)
                self.assertTrue(result[0].startswith(expected))

    def test_assets_and_private_paths(self):
        for path in ["/", "/app.mjs", "/engine.mjs", "/config.js", "/style.css", "/paper.svg", "/seal.svg"]:
            status, headers, body = request(application, "GET", path)
            self.assertEqual(status, "200 OK", path)
            self.assertEqual(int(headers["Content-Length"]), len(body))
        status, _, body = request(application, "HEAD", "/app.mjs")
        self.assertEqual((status, body), ("200 OK", b""))
        for path in ["/.git/config", "/../engine.py", "/engine.py", "/api/other"]:
            self.assertTrue(request(application, "GET", path)[0].startswith("404"))
