# AXL P2P Agent Handoff Demo

Real peer-to-peer receipt handoff using Gensyn's AXL network (built on Yggdrasil).

## Setup

```bash
# Build AXL binary (requires Go 1.25+)
cd bin/axl-repo && go build -o ../axl-node ./cmd/node

# Start Node A (listener, API on port 9002)
cd node-a && ../bin/axl-node -config node-config.json

# Start Node B (connects to A, API on port 9003)
cd node-b && ../bin/axl-node -config node-config.json
```

## Run Demo

```bash
# Terminal 3: Send receipt handoff from Agent A via Node A
npx tsx sender.ts

# Terminal 4: Receive and verify on Agent B via Node B
npx tsx receiver.ts
```

## What Happens

1. Agent A creates 3 receipts (file_read, llm_call, output)
2. Sender serializes the handoff bundle and sends via AXL P2P to Node B's peer
3. Receiver polls Node B for incoming messages
4. Agent B receives the bundle, verifies chain root hash matches
5. Agent B extends the chain with 2 more receipts using `continueFrom()`
6. No centralized server — pure peer-to-peer transport
