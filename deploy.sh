#!/usr/bin/env bash
# Build and publish the static site to the VPS (Git Bash, from this folder):  ./deploy.sh
# First run also adds a Caddy block (backed up and validated first). Static files only: no server process.
set -euo pipefail

TARGET="${DEPLOY_TARGET:-sraas}"
# Add rickroll.sraas.dev in front once its A record exists (see README).
HOSTS="${HOSTS:-rick.sraas.dev}"

pnpm build
tar czf - -C dist . | ssh "$TARGET" "HOSTS='$HOSTS' bash -c '
  set -e
  rm -rf /var/www/rickroll.new && mkdir -p /var/www/rickroll.new
  tar xzf - -C /var/www/rickroll.new
  rm -rf /var/www/rickroll.old
  [ -d /var/www/rickroll ] && mv /var/www/rickroll /var/www/rickroll.old
  mv /var/www/rickroll.new /var/www/rickroll && rm -rf /var/www/rickroll.old
  if ! grep -q \"Rickroll.exe (added by rickroll/deploy.sh)\" /etc/caddy/Caddyfile; then
    B=/etc/caddy/Caddyfile.bak-\$(date +%F-%H%M)-rickroll
    cp /etc/caddy/Caddyfile \$B
    printf \"\n# ---- Rickroll.exe (added by rickroll/deploy.sh) ---- static site, images are processed in the browser\n%s {\n\timport horsetinder_log rickroll\n\tencode zstd gzip\n\troot * /var/www/rickroll\n\t@assets path /assets/*\n\theader @assets Cache-Control \\\"public, max-age=31536000, immutable\\\"\n\theader X-Content-Type-Options nosniff\n\tfile_server\n}\n\" \"\$HOSTS\" >> /etc/caddy/Caddyfile
    touch /var/log/caddy/rickroll.log && chown caddy:caddy /var/log/caddy/rickroll.log
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || { cp \$B /etc/caddy/Caddyfile; echo Caddyfile invalid, restored; exit 1; }
    systemctl reload caddy
  fi
  echo published
'"
echo "> Done: https://${HOSTS%%,*}"
