#!/usr/bin/env bash
# Finish the itch.io publish in one command — run this once itch.io is reachable again.
#
# WHY THIS EXISTS: itch.io's main site is DNS-poisoned and SNI-blocked on this network (itch.io
# resolves to Facebook IP ranges, Cloudflare IPs refuse the TLS handshake, and DoH is blocked too),
# so the project page could not be created and butler cannot upload. Only `html-classic.itch.zone`
# (the Akamai CDN that serves already-published games) is reachable.
#
# Prerequisites once the network is fixed (VPN/proxy on):
#   1. The project page must exist (butler cannot create it) — create it at https://itch.io/game/new
#      as user zsy2026, Title "Aetheria: Dawnwake · 以太利亚 · 黎明觉醒", slug "aetheria-dawnwake",
#      Kind = HTML, Classification = Games. Copy for every field is in docs/PUBLISH.md.
#   2. Upload the cover (release/itch/cover.jpg, 630x500) and the screenshots (release/itch/shots/*.png).
#   3. Then run this script: it pushes the build and verifies the page.
set -uo pipefail

BUTLER="$HOME/.local/bin/butler"
USER="zsy2026"
SLUG="aetheria-dawnwake"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$ROOT/release/itch"   # persistent: /tmp gets cleaned by the OS (see the skill)

echo "== 1/5 build =="
(cd "$ROOT" && npm run build) || exit 1

echo "== 2/5 package (index.html must sit at the zip root) =="
mkdir -p "$PKG"
rm -f "$PKG/$SLUG-html5.zip"
(cd "$ROOT/dist" && zip -qr "$PKG/$SLUG-html5.zip" . -x "*.map") || exit 1
unzip -l "$PKG/$SLUG-html5.zip" | head -5

echo "== 3/5 is the project reachable? =="
"$BUTLER" status "$USER/$SLUG" >/dev/null 2>&1 || {
  echo "!! butler cannot see $USER/$SLUG — the page does not exist yet, or itch.io is still blocked."
  echo "   \`butler status\` returning 'invalid game (400)' means the page is missing; the page must be"
  echo "   created in the browser first (see the header of this script)."
}

echo "== 4/5 push the build on the html5 channel =="
"$BUTLER" push "$ROOT/dist" "$USER/$SLUG:html5" --assume-yes --userversion "$(git -C "$ROOT" rev-parse --short HEAD)" || exit 1

echo "== 5/5 verify =="
"$BUTLER" status "$USER/$SLUG"
code=$(curl -s -o /dev/null -m 20 -w "%{http_code}" "https://$USER.itch.io/$SLUG")
echo "page: https://$USER.itch.io/$SLUG -> HTTP $code"
[ "$code" = "200" ] || echo "!! not 200 yet: a new project may still be a Draft — set Visibility to Public on the Edit project page"
