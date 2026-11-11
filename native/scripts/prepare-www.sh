#!/usr/bin/env bash
# Copies the web app (app/ folder) into native/www and makes it work offline inside the Android app.
set -euo pipefail
VER="${1:-1.0.0}"; VER="${VER#v}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WWW="$ROOT/native/www"

rm -rf "$WWW"; mkdir -p "$WWW/vendor"
cp "$ROOT/app/index.html" "$WWW/index.html"
cp "$ROOT"/app/*.png "$WWW/" 2>/dev/null || true
cp "$ROOT/native/node_modules/@supabase/supabase-js/dist/umd/supabase.js" "$WWW/vendor/supabase.js"

# Use the bundled Supabase library instead of the CDN, remove the web-only manifest, stamp the version.
sed -i 's#https://cdn.jsdelivr.net/npm/@supabase/supabase-js@[0-9.]*/dist/umd/supabase.min.js#vendor/supabase.js#' "$WWW/index.html"
sed -i '/rel="manifest"/d' "$WWW/index.html"
sed -i "s/const APP_VERSION = '[^']*'/const APP_VERSION = '$VER'/" "$WWW/index.html"

grep -q 'vendor/supabase.js' "$WWW/index.html" || { echo "ERROR: Supabase script tag was not found in app/index.html"; exit 1; }
grep -q "APP_VERSION = '$VER'" "$WWW/index.html" || { echo "ERROR: APP_VERSION was not found in app/index.html"; exit 1; }
echo "Web files ready (version $VER)."
