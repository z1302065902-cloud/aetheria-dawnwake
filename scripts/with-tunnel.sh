#!/usr/bin/env bash
# 让任意命令走 LetsVPN 隧道（分流模式下 CLI 默认不走，见 scripts/tunnel-proxy.py 的说明）。
#
#   scripts/with-tunnel.sh butler push dist zsy2026/aetheria-dawnwake:html5
#   scripts/with-tunnel.sh curl -sI https://itch.io/
#   scripts/with-tunnel.sh bash              # 交互 shell 里所有命令都走隧道
set -euo pipefail
IFACE="${TUNNEL_IFACE:-}"
PORT="${TUNNEL_PORT:-8899}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 自动识别隧道网卡：有 IPv4 的 utun（LetsVPN 通常是 utun6，但不是固定值）
if [ -z "$IFACE" ]; then
  IFACE="$(ifconfig 2>/dev/null | awk '/^utun/{iface=$1} /inet /{if (iface && $2 !~ /^fe80/) {print substr(iface,1,length(iface)-1); exit}}')"
fi
if [ -z "$IFACE" ]; then
  echo "✗ 找不到带 IPv4 的 utun 接口 —— 先连上 LetsVPN" >&2
  exit 1
fi

if ! (exec 3<>/dev/tcp/127.0.0.1/$PORT) 2>/dev/null; then
  nohup python3 "$ROOT/scripts/tunnel-proxy.py" "$IFACE" "$PORT" > /tmp/tunnel-proxy.log 2>&1 &
  sleep 2
fi
echo "→ 经 $IFACE :$PORT 执行: $*" >&2
HTTPS_PROXY="http://127.0.0.1:$PORT" HTTP_PROXY="http://127.0.0.1:$PORT" "$@"
