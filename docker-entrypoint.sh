#!/bin/sh
set -e

# If /app/templates is empty (e.g. shadowed by an empty host bind mount), populate with defaults
if [ -d /app/templates.default ] && [ -z "$(ls -A /app/templates 2>/dev/null)" ]; then
  mkdir -p /app/templates
  cp -r /app/templates.default/* /app/templates/ 2>/dev/null || true
fi

exec "$@"
