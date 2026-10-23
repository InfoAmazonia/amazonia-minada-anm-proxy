#!/bin/sh
# Restore the two Azure services without touching ANM generations or the timer.
set -eu
backup=${1:?Usage: sudo sh ops/rollback-images.sh /var/backups/minada/proxy-images-TIMESTAMP}
[ "$(id -u)" -eq 0 ] || { echo 'Run as root' >&2; exit 1; }
app=/opt/services/amazonia-minada-anm-proxy
edge=/opt/services/proxy
[ -f "$backup/source.before.tgz" ] && [ -f "$backup/config.before.tgz" ]
# Backups must be local, trusted and readable only by administrators.
if ! docker image inspect minada-proxy:rollback-20261023 minada-traefik:rollback-20261023 >/dev/null 2>&1; then
  gzip -dc "$backup/images.before.tgz" | docker load
fi
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
tar -xzf "$backup/config.before.tgz" -C "$tmp" opt/services/proxy/docker-compose.yml
# Restore sources too: the former image consumes the legacy TypeScript mounts.
tar -xzf "$backup/source.before.tgz" -C "$app"
cp "$tmp/opt/services/proxy/docker-compose.yml" "$edge/docker-compose.yml"
printf 'services:\n  app:\n    image: minada-proxy:rollback-20261023\n' > "$tmp/app.yml"
printf 'services:\n  app:\n    image: minada-traefik:rollback-20261023\n' > "$tmp/edge.yml"
docker compose --project-directory "$app" -f "$app/docker-compose.yml" -f "$tmp/app.yml" up -d --no-build --pull never app
docker compose --project-directory "$edge" -f "$edge/docker-compose.yml" -f "$tmp/edge.yml" up -d --no-build --pull never app
echo 'Previous images restored. Verify public download receipt/hash, APIs, site and CSV.'
