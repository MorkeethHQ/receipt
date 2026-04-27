# openclaw-plugin-receipt

Cryptographic receipt chain for every OpenClaw agent run.

Every tool call, context read, decision, and message becomes a signed, hash-linked receipt. Chains are verifiable by anyone — no trust required.

## Install

```bash
cd /opt/bagel-openclaw
openclaw plugins install openclaw-plugin-receipt
```

Or from source:

```bash
git clone https://github.com/MorkeethHQ/receipt.git
cd receipt/packages/openclaw-plugin-receipt
npm run build
openclaw plugins install .
```

## Configure

In `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "receipt": {
        "enabled": true,
        "config": {
          "maxRawSize": 2048,
          "axlForward": false,
          "axlPeerId": ""
        }
      }
    }
  }
}
```

## HTTP Endpoints

Once installed, the gateway exposes:

| Endpoint | Description |
|----------|-------------|
| `GET /plugins/receipt/chains` | List all completed chains |
| `GET /plugins/receipt/chains/:id` | Get a specific chain |
| `GET /plugins/receipt/latest` | Most recent chain |
| `GET /plugins/receipt/active` | Currently building chain |
| `GET /plugins/receipt/verify/:id` | Verify chain integrity |

## What Gets Receipted

| Agent Action | Receipt Type | Hook |
|-------------|-------------|------|
| Loading context/memory | `context_read` | `before_prompt_build` |
| Calling a tool | `tool_call` | `before_tool_call` |
| Tool returns result | `tool_result` | `after_tool_call` |
| Sending a message | `message_send` | `message_sending` |
| Final answer | `decision` | `agent_end` |

## AXL Forwarding

To forward completed chains to another machine via Gensyn AXL:

```json
{
  "config": {
    "axlForward": true,
    "axlPeerId": "<receiver-peer-id>"
  }
}
```

The receiver can verify the chain independently using `agenticproof`:

```typescript
import { verifyChain } from 'agenticproof';
const result = verifyChain(chain.receipts);
console.log(result.valid); // true
```

## Built on

- [agenticproof](https://www.npmjs.com/package/agenticproof) — cryptographic proof layer
- [0G Compute](https://0g.ai) — TEE-attested inference
- [Gensyn AXL](https://gensyn.ai) — P2P agent transport
