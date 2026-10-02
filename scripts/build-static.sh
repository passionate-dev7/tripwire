#!/usr/bin/env bash
# Builds tripwire as plain static files for Vercel with zero serverless functions. /api/* is proxied by Vercel's CDN
# (an external rewrite, not a function) to the keeper on the Mac mini behind Tailscale Funnel. Output: web/out-static/
set -euo pipefail
API_ORIGIN=${API_ORIGIN:-https://teslas-mac-mini.tail57f771.ts.net:10000/tripwire}
HERE=$(cd "$(dirname "$0")/.." && pwd)
cd "$HERE/web"
rm -rf out
NEXT_PUBLIC_KEEPER_API="" bunx next build > /tmp/tripwire-static.log 2>&1 || { tail -30 /tmp/tripwire-static.log; exit 1; }
LINK=$(mktemp -d); [ -d out-static/.vercel ] && cp -R out-static/.vercel "$LINK/"
rm -rf out-static && cp -R out out-static
[ -d "$LINK/.vercel" ] && cp -R "$LINK/.vercel" out-static/; rm -rf "$LINK"
cat > out-static/vercel.json <<JSON
{
  "\$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "buildCommand": null,
  "rewrites": [{ "source": "/api/:path*", "destination": "$API_ORIGIN/api/:path*" }],
  "headers": [{ "source": "/(.*)", "headers": [{ "key": "X-Content-Type-Options", "value": "nosniff" }, { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }] }]
}
JSON
echo "static build in $HERE/web/out-static ($(find out-static -type f | wc -l | tr -d ' ') files)"
