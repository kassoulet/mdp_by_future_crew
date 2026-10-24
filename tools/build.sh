#!/bin/bash
# Assemble the static site: site/ + the three discs under discs/. Usage: tools/build.sh [outdir]
set -e
cd "$(dirname "$0")/.."
out=${1:-dist}
rm -rf "$out"; mkdir -p "$out/discs"
cp -r site/. "$out/"
for d in journey1 journey2 chmind; do
  mkdir -p "$out/discs/$d"
  cp "$d"/*.S3M "$d"/*.MOD "$d"/MDP.MDI "$out/discs/$d/" 2>/dev/null || true
done

# Cache busting: GitHub Pages lets browsers keep each file for 10 minutes, which can mix an old app.js with a new
# page. Stamp every module URL with the commit so a deploy always loads a consistent set.
v=$(git rev-parse --short HEAD 2>/dev/null || date +%s)
sed -i -E "s#(from '\./[a-z0-9._-]+\.js)'#\1?v=$v'#; s#(from '\.\./vendor/[a-z0-9._-]+\.js)'#\1?v=$v'#; s#(new URL\('\./mdp\.worklet\.js)'#\1?v=$v'#" "$out"/js/*.js
sed -i -E "s#(\./js/app\.js)'#\1?v=$v'#" "$out/disc.html"
