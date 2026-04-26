#!/bin/bash
# Deploy openclaw-plugin-receipt to Hetzner VPS
#
# Usage: ./scripts/deploy-plugin.sh
#
# Prerequisites:
#   - SSH key at ~/.ssh/id_ed25519_bagel
#   - OpenClaw running at 204.168.133.192
#   - Plugin built (npm run build in packages/openclaw-plugin-receipt)

set -euo pipefail

VPS_HOST="root@204.168.133.192"
VPS_KEY="$HOME/.ssh/id_ed25519_bagel"
PLUGIN_DIR="packages/openclaw-plugin-receipt"
REMOTE_DIR="/opt/openclaw-plugin-receipt"

echo "=== Building plugin ==="
cd "$(git rev-parse --show-toplevel)"
cd "$PLUGIN_DIR"
npm run build
cd "$(git rev-parse --show-toplevel)"

echo ""
echo "=== Uploading to VPS ==="
ssh -i "$VPS_KEY" "$VPS_HOST" "mkdir -p $REMOTE_DIR"
scp -i "$VPS_KEY" -r \
  "$PLUGIN_DIR/dist" \
  "$PLUGIN_DIR/package.json" \
  "$PLUGIN_DIR/openclaw.plugin.json" \
  "$PLUGIN_DIR/README.md" \
  "$VPS_HOST:$REMOTE_DIR/"

echo ""
echo "=== Installing dependencies on VPS ==="
ssh -i "$VPS_KEY" "$VPS_HOST" "cd $REMOTE_DIR && npm install --production 2>/dev/null || true"

echo ""
echo "=== Installing plugin ==="
ssh -i "$VPS_KEY" "$VPS_HOST" "cd /opt/bagel-openclaw && docker compose run --rm openclaw-cli plugins install $REMOTE_DIR"

echo ""
echo "=== Restarting gateway ==="
ssh -i "$VPS_KEY" "$VPS_HOST" "cd /opt/bagel-openclaw && docker compose restart openclaw-gateway"

echo ""
echo "=== Verifying ==="
sleep 3
ssh -i "$VPS_KEY" "$VPS_HOST" "cd /opt/bagel-openclaw && docker compose run --rm openclaw-cli plugins list | grep -i receipt || echo 'Plugin not found in list — check manually'"

echo ""
echo "=== Testing endpoint ==="
ssh -i "$VPS_KEY" "$VPS_HOST" "curl -sS http://127.0.0.1:18789/plugins/receipt/chains 2>/dev/null || echo 'Endpoint not reachable yet — gateway may still be starting'"

echo ""
echo "Done. Send Bagel a test message via Telegram, then check:"
echo "  ssh -i $VPS_KEY $VPS_HOST 'curl -sS http://127.0.0.1:18789/plugins/receipt/latest'"
