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
