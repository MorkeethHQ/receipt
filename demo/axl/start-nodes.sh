#!/bin/bash
# Start both AXL nodes for RECEIPT demo
# Researcher on port 9002, Builder on port 9012
#
# Prerequisites:
#   git clone https://github.com/gensyn-ai/axl.git
#   cd axl && go1.25.5 build -o node ./cmd/node/
#   Copy the 'node' binary to this directory, or set AXL_BIN

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

AXL_BIN="${AXL_BIN:-./bin/node}"
if [ ! -f "$AXL_BIN" ]; then
  AXL_BIN="../../axl/node"
fi
if [ ! -f "$AXL_BIN" ]; then
  echo "AXL binary not found. Build it:"
  echo "  git clone https://github.com/gensyn-ai/axl.git"
  echo "  cd axl && go1.25.5 build -o node ./cmd/node/"
  echo "  cp node ../../demo/axl/bin/"
  exit 1
fi

# Generate keys if missing
if [ ! -f researcher.pem ]; then
  echo "Generating researcher key..."
  openssl genpkey -algorithm ed25519 -out researcher.pem 2>/dev/null || \
    /opt/homebrew/opt/openssl@3/bin/openssl genpkey -algorithm ed25519 -out researcher.pem
fi
if [ ! -f builder.pem ]; then
  echo "Generating builder key..."
  openssl genpkey -algorithm ed25519 -out builder.pem 2>/dev/null || \
    /opt/homebrew/opt/openssl@3/bin/openssl genpkey -algorithm ed25519 -out builder.pem
fi

# Kill existing nodes
pkill -f "node -config researcher-config" 2>/dev/null
pkill -f "node -config builder-config" 2>/dev/null
sleep 1

echo "Starting Researcher node (port 9002)..."
"$AXL_BIN" -config researcher-config.json > /tmp/axl-researcher.log 2>&1 &
RPID=$!
sleep 2

echo "Starting Builder node (port 9012, peered to Researcher)..."
"$AXL_BIN" -config builder-config.json > /tmp/axl-builder.log 2>&1 &
BPID=$!
sleep 2

# Verify
RKEY=$(curl -s http://127.0.0.1:9002/topology | python3 -c "import sys,json; print(json.load(sys.stdin)['our_public_key'])" 2>/dev/null)
BKEY=$(curl -s http://127.0.0.1:9012/topology | python3 -c "import sys,json; print(json.load(sys.stdin)['our_public_key'])" 2>/dev/null)

if [ -n "$RKEY" ] && [ -n "$BKEY" ]; then
  echo ""
  echo "Both nodes running!"
  echo "  Researcher: PID $RPID, key ${RKEY:0:16}..."
  echo "  Builder:    PID $BPID, key ${BKEY:0:16}..."
  echo ""
  echo "Add to demo/app/.env.local:"
  echo "  AXL_RESEARCHER_KEY=$RKEY"
  echo "  AXL_BUILDER_KEY=$BKEY"
  echo ""
  echo "Logs: /tmp/axl-researcher.log, /tmp/axl-builder.log"
else
  echo "ERROR: One or both nodes failed to start."
  echo "Check logs: /tmp/axl-researcher.log, /tmp/axl-builder.log"
  exit 1
fi
