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
# Terminal 3: Receive and verify on Agent B via Node B (start first so it's waiting)
npx tsx demo/axl/receiver.ts

# Terminal 4: Send receipt handoff from Agent A via Node A
npx tsx demo/axl/sender.ts
```

## What Happens

### Sender (Agent A)

1. Connects to AXL node on port 9002, discovers peers
2. Creates 5 receipts representing real agent work:
   - `file_read` — reads the project README
   - `api_call` — fetches platform statistics
   - `llm_call` — analyzes stats and project health
   - `decision` — decides to hand off to Agent B
   - `output` — produces research summary
3. Serializes receipt chain + ed25519 public key into handoff bundle
4. Sends via AXL P2P to the receiver peer
5. Prints receipt-by-receipt progress with IDs, chain links, and signatures

### Receiver (Agent B)

1. Connects to AXL node on port 9003, polls for incoming messages
2. Receives handoff bundle with sender's public key
3. Verifies chain root hash matches (tamper detection)
4. Verifies every receipt signature + hash links using `verifyChain()` with the sender's ed25519 key
5. If invalid: prints detailed failure info and rejects the handoff
6. If valid: extends the chain with 4 new receipts (Agent B work):
   - `file_read` — reads handoff metadata
   - `llm_call` — reviews and validates the recommendation
   - `decision` — accepts the recommendation
   - `output` — produces implementation plan
7. Prints full 9-receipt chain spanning both agents

## SDK Integration

The `AxlTransport` class in `packages/receipt-sdk/src/integrations/axl.ts` provides:

- `connect()` — check AXL node reachability, return node info
- `discoverPeers()` — list available peers on the AXL network
- `sendHandoff(peerId, receipts, publicKey, bundle)` — send receipt bundle + public key to peer
- `receiveHandoff()` — poll for incoming receipt bundle
- `waitForHandoff(timeoutMs)` — block until a handoff arrives or timeout

The handoff payload includes the sender's ed25519 public key so the receiver can cryptographically verify every receipt signature without any out-of-band key exchange.

## Architecture

```
Node A (port 9002)                    Node B (port 9003)
  Agent A                               Agent B
    |                                      |
    +-- file_read  -> receipt_1            |  (waiting for handoff)
    +-- api_call   -> receipt_2            |
    +-- llm_call   -> receipt_3            |
    +-- decision   -> receipt_4            |
    +-- output     -> receipt_5            |
    |                                      |
    +--- AXL P2P (handoff bundle) -------->|
                                           +-- verify root hash
                                           +-- verify 5 signatures (ed25519)
                                           +-- verify 5 chain links
                                           |
                                           +-- file_read  -> receipt_6
                                           +-- llm_call   -> receipt_7
                                           +-- decision   -> receipt_8
                                           +-- output     -> receipt_9
```

No centralized server. Pure peer-to-peer transport via Gensyn AXL.
