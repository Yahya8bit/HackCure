#!/bin/sh
# Local demo only: create a self-signed certificate on first start if none exists.
# /etc/nginx/certs is mounted from ./certs (docker-compose.yml), so the SAME certificate survives
# container rebuilds and can be trusted once in the browser / OS (see docs/DEMO_DAY.md).
# TLS_EXTRA_SAN (optional) adds names/IPs, e.g. "IP:192.168.43.10" for phones on the demo hotspot;
# delete ./certs/server.* and restart the web container to regenerate after changing it.
set -e
mkdir -p /etc/nginx/certs
if [ ! -f /etc/nginx/certs/server.crt ]; then
  SAN="DNS:localhost,IP:127.0.0.1${TLS_EXTRA_SAN:+,$TLS_EXTRA_SAN}"
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 -subj "/CN=Nawba local demo" \
    -addext "subjectAltName=$SAN" -addext "basicConstraints=critical,CA:TRUE" \
    -keyout /etc/nginx/certs/server.key -out /etc/nginx/certs/server.crt 2>/dev/null
  chmod 644 /etc/nginx/certs/server.crt
fi
