#!/usr/bin/env python3
"""本機起一個伺服器，把 repo 掛在 http://127.0.0.1:8732/daily-todo/。
（路徑要和 GitHub Pages 一致，manifest 與 Service Worker 的 scope 才會對。）
用法：python3 test/serve.py"""
import http.server, os, socketserver, tempfile, pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent
root = pathlib.Path(tempfile.gettempdir()) / 'daily-todo-serve'
root.mkdir(exist_ok=True)
link = root / 'daily-todo'
if link.is_symlink() or link.exists():
    link.unlink()
link.symlink_to(REPO)
os.chdir(root)


class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
print('http://127.0.0.1:8732/daily-todo/')
with socketserver.TCPServer(('127.0.0.1', 8732), H) as httpd:
    httpd.serve_forever()
