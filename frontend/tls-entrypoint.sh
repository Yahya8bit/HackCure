#!/bin/sh
# Local demo only: create a self-signed certificate on first start if none is mounted.
# In production mount a real certificate at /etc/nginx/certs instead.
set -e
mkdir -p /etc/nginx/certs
if [ ! -f /etc/nginx/certs/server.crt ]; then
  openssl req -x509 -nodes -newkey rsa:2048 -days 365 -subj "/CN=localhost" \
    -keyout /etc/nginx/certs/server.key -out /etc/nginx/certs/server.crt 2>/dev/null
fi
