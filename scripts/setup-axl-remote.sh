#!/bin/bash
# Setup AXL for two-machine RECEIPT demo
#
# Machine A (VPS - Researcher/OpenClaw):
#   ./scripts/setup-axl-remote.sh researcher <VPS_PUBLIC_IP>
#
# Machine B (Mac - Builder):
#   ./scripts/setup-axl-remote.sh builder <VPS_PUBLIC_IP>
#
# Prerequisites:
#   - Go 1.21+ installed (for building AXL on Linux)
#   - Port 9001 open on VPS firewall

set -e

ROLE=${1:-researcher}
REMOTE_IP=${2:-""}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AXL_DIR="$SCRIPT_DIR/../axl"

if [ -z "$REMOTE_IP" ] && [ "$ROLE" = "builder" ]; then
  echo "Usage: $0 builder <VPS_IP>"
  echo "  The builder needs the VPS IP to connect via AXL."
  exit 1
fi

# Check if AXL binary exists for current platform
if [ ! -f "$AXL_DIR/node" ]; then
  echo "AXL binary not found at $AXL_DIR/node"
  echo ""
  echo "Building from source..."

  if ! command -v go &>/dev/null; then
    echo "Go not found. Install Go 1.21+ first:"
    echo "  Mac:   brew install go"
    echo "  Linux: sudo apt install golang-go"
    exit 1
  fi

  cd "$AXL_DIR"
  if [ ! -d ".git" ]; then
    echo "AXL source not found. Cloning..."
    git clone https://github.com/gensyn-ai/axl .axl-src
    cd .axl-src
  fi

  echo "Building AXL node..."
  go build -o "$AXL_DIR/node" ./cmd/node
  echo "Built: $AXL_DIR/node"
  cd "$AXL_DIR"
fi

# Generate key if needed
KEY_FILE="$AXL_DIR/${ROLE}.pem"
if [ ! -f "$KEY_FILE" ]; then
  echo "Generating $ROLE key..."
  openssl genpkey -algorithm ed25519 -out "$KEY_FILE"
fi

# Write config
if [ "$ROLE" = "researcher" ]; then
  cat > "$AXL_DIR/${ROLE}-remote.json" <<EOF
{
  "PrivateKeyPath": "${ROLE}.pem",
  "Peers": [],
  "Listen": ["tls://0.0.0.0:9001"],
  "api_port": 9002,
  "tcp_port": 7000
}
EOF
  echo "Researcher config: listens on 0.0.0.0:9001 (public)"
  echo ""
  echo "Starting Researcher AXL node..."
  cd "$AXL_DIR"
  pkill -f "node -config ${ROLE}-remote" 2>/dev/null || true
  sleep 1
  ./node -config "${ROLE}-remote.json" > /tmp/axl-${ROLE}.log 2>&1 &
  PID=$!
  sleep 2

  KEY=$(curl -s http://127.0.0.1:9002/topology | python3 -c "import sys,json; print(json.load(sys.stdin)['our_public_key'])" 2>/dev/null || echo "FAILED")

  if [ "$KEY" != "FAILED" ] && [ -n "$KEY" ]; then
    echo ""
    echo "=== RESEARCHER NODE RUNNING ==="
    echo "  PID: $PID"
    echo "  API: http://127.0.0.1:9002"
    echo "  Public key: ${KEY:0:32}..."
    echo ""
    echo "On the Builder machine, run:"
    echo "  ./scripts/setup-axl-remote.sh builder $REMOTE_IP"
    echo ""
    echo "Set in your .env:"
    echo "  AXL_RESEARCHER_URL=http://127.0.0.1:9002"
    echo "  AXL_RESEARCHER_KEY=$KEY"
  else
    echo "ERROR: Node failed to start. Check /tmp/axl-${ROLE}.log"
    exit 1
  fi

elif [ "$ROLE" = "builder" ]; then
  cat > "$AXL_DIR/${ROLE}-remote.json" <<EOF
{
  "PrivateKeyPath": "${ROLE}.pem",
  "Peers": ["tls://${REMOTE_IP}:9001"],
  "Listen": ["tls://0.0.0.0:9011"],
  "api_port": 9012,
  "tcp_port": 7001
}
EOF
  echo "Builder config: connects to Researcher at ${REMOTE_IP}:9001"
  echo ""
  echo "Starting Builder AXL node..."
  cd "$AXL_DIR"
  pkill -f "node -config ${ROLE}-remote" 2>/dev/null || true
  sleep 1
  ./node -config "${ROLE}-remote.json" > /tmp/axl-${ROLE}.log 2>&1 &
  PID=$!
  sleep 3

  KEY=$(curl -s http://127.0.0.1:9012/topology | python3 -c "import sys,json; print(json.load(sys.stdin)['our_public_key'])" 2>/dev/null || echo "FAILED")
  PEERS=$(curl -s http://127.0.0.1:9012/topology | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('peers',[])))" 2>/dev/null || echo "0")

  if [ "$KEY" != "FAILED" ] && [ -n "$KEY" ]; then
    echo ""
    echo "=== BUILDER NODE RUNNING ==="
    echo "  PID: $PID"
    echo "  API: http://127.0.0.1:9012"
    echo "  Public key: ${KEY:0:32}..."
    echo "  Peers found: $PEERS"
    echo ""
    echo "Set in your .env:"
    echo "  AXL_BUILDER_URL=http://127.0.0.1:9012"
    echo "  AXL_BUILDER_KEY=$KEY"

    if [ "$PEERS" = "0" ]; then
      echo ""
      echo "WARNING: No peers found. Check:"
      echo "  1. VPS firewall allows port 9001 (ufw allow 9001)"
      echo "  2. Researcher node is running on VPS"
      echo "  3. IP $REMOTE_IP is correct"
    fi
  else
    echo "ERROR: Node failed to start. Check /tmp/axl-${ROLE}.log"
    exit 1
  fi
fi

echo ""
echo "Log: /tmp/axl-${ROLE}.log"
