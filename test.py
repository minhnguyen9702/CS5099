"""tests import ES modules and three.js through an import map 
so they have to be served over HTTP. Serving from the project directory 
lets the test modules import the application modules from ./static.
"""

import http.server
import os
import socketserver
import webbrowser

os.chdir(os.path.dirname(os.path.abspath(__file__)))

with socketserver.TCPServer(("", 0), http.server.SimpleHTTPRequestHandler) as httpd:
    url = f"http://localhost:{httpd.server_address[1]}/tests/"
    print(f"Serving tests at {url}")
    webbrowser.open(url)
    httpd.serve_forever()
