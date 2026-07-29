"""Serve index.html and its assets over HTTP."""

import http.server
import os
import socketserver
import webbrowser

os.chdir(os.path.dirname(os.path.abspath(__file__)))

with socketserver.TCPServer(("", 0), http.server.SimpleHTTPRequestHandler) as httpd:
    url = f"http://localhost:{httpd.server_address[1]}/"
    print(f"Serving at {url}")
    webbrowser.open(url)
    httpd.serve_forever()
