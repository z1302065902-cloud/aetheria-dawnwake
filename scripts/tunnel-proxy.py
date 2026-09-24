#!/usr/bin/env python3
"""本地 HTTP CONNECT 代理：把出站连接绑定到指定网卡（默认 utun6 = LetsVPN 隧道）。

为什么需要它（本轮实测结论）
--------------------------------------------------
LetsVPN 在本机是**分流模式**：隧道接口 utun6 起来了（`inet 26.26.26.1`），但它只给少数目标加了路由，
默认路由仍在 en0。结果是：

    普通请求          → 走 en0 → itch.io 被 DNS 污染 + SNI 阻断 → 000
    绑定 utun6 的请求 → 走隧道 → itch.io 200 ✅

浏览器能打开 itch（Chromium 自己走了隧道/DNS），但 curl / git / butler 默认不走，所以本脚本把
「绑定网卡的出站」包装成一个 127.0.0.1 上的 HTTP 代理，于是：

    HTTPS_PROXY=http://127.0.0.1:8899 butler push ...
    curl -x http://127.0.0.1:8899 https://itch.io/

即可让 CLI 工具走隧道，且**不需要 sudo**（绑接口用 SO_BINDTODEVICE，仅需该接口存在）。

用法
----
    python3 scripts/tunnel-proxy.py [iface] [port]     # 默认 utun6 8899
    # 检查隧道接口名：
    ifconfig | grep -A2 '^utun' | grep 'inet '
"""
import socket, socketserver, select, sys

IFACE = sys.argv[1] if len(sys.argv) > 1 else 'utun6'
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8899

class Handler(socketserver.BaseRequestHandler):
    def handle(self):
        self.request.settimeout(20)
        try:
            head = self.request.recv(4096)
        except Exception:
            return
        if not head:
            return
        first = head.split(b'\r\n', 1)[0].decode('latin-1', 'replace')
        parts = first.split()
        if len(parts) < 2 or parts[0] != 'CONNECT':
            self.request.sendall(b'HTTP/1.1 405 Method Not Allowed\r\n\r\n')
            return
        host, _, port = parts[1].partition(':')
        port = int(port or 443)
        try:
            up = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            up.setsockopt(socket.SOL_SOCKET, socket.SO_BINDTODEVICE, IFACE.encode() + b'\x00')
            up.settimeout(20)
            up.connect((socket.gethostbyname(host), port))
        except Exception as e:
            self.request.sendall(f'HTTP/1.1 502 Bad Gateway\r\n\r\n{e}'.encode())
            return
        self.request.sendall(b'HTTP/1.1 200 Connection Established\r\n\r\n')
        socks = [self.request, up]
        while True:
            try:
                r, _, _ = select.select(socks, [], [], 30)
            except Exception:
                break
            if not r:
                break
            for s in r:
                try:
                    data = s.recv(65536)
                except Exception:
                    data = b''
                if not data:
                    return
                try:
                    (up if s is self.request else self.request).sendall(data)
                except Exception:
                    return

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

print(f'proxy on 127.0.0.1:{PORT} -> iface {IFACE}', flush=True)
Server(('127.0.0.1', PORT), Handler).serve_forever()
