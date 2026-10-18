#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if command -v bundle >/dev/null 2>&1; then
  bundler=bundle
elif command -v bundle2.7 >/dev/null 2>&1; then
  bundler=bundle2.7
else
  echo "Bundler is required. Install it with: gem install bundler" >&2
  exit 1
fi

exec "$bundler" exec jekyll serve --livereload --host 127.0.0.1 "$@"
