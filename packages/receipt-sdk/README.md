# agenticproof

Cryptographic proof layer for AI agent work. Ed25519-signed, hash-linked receipt chains.

Every action an AI agent takes -- file reads, API calls, LLM inferences, decisions -- gets a signed receipt. Receipts link into a tamper-evident chain that can be verified, handed off to other agents, and anchored on-chain.

## Install

```bash
npm install agenticproof
```

## Quick Start

```typescript
import { ReceiptAgent, verifyChain } from 'agenticproof';

const agent = ReceiptAgent.create('researcher');

agent.callApi('https://api.example.com/data', '{"results": 42}');
agent.callLlm('Summarize the results', 'The data shows 42 results.');
agent.decide('Results are significant', 'Proceed with analysis');
agent.produceOutput('Final report', 'Analysis complete: 42 confirmed.');

const chain = agent.getChain();
const results = verifyChain(agent.getReceipts(), agent.getPublicKey());
console.log('Chain valid:', results.every(r => r.valid)); // true
```

## What It Does

- **Receipt chain** -- every agent action produces a signed receipt with input/output hashes
- **Ed25519 signatures** -- each receipt is signed with the agent's private key
- **Hash linking** -- each receipt references the previous receipt's ID, forming a tamper-evident chain
- **Verification** -- verify individual receipts or entire chains against a public key
- **Multi-agent handoff** -- bundle a chain and hand it to another agent with full provenance
- **Action types** -- file reads, API calls, LLM calls, decisions, tool calls, messages, usefulness reviews
- **On-chain anchoring** -- anchor receipt chain root hashes to 0G Mainnet

## API Reference

### Core Exports

```typescript
import {
  ReceiptAgent,       // High-level agent that records and signs receipts
  ReceiptChain,       // Ordered chain of receipts with hash linking
  createReceipt,      // Low-level receipt creation
  verifyReceipt,      // Verify a single receipt
  verifyChain,        // Verify an entire receipt chain
  hash,               // SHA-256 hash utility
  generateKeyPair,    // Generate Ed25519 key pair
  sign,               // Sign a message
  verify,             // Verify a signature
  publicKeyToHex,     // Convert public key to hex string
} from 'agenticproof';
```

### ReceiptAgent Methods

| Method | Description |
|--------|-------------|
| `ReceiptAgent.create(name)` | Create a named agent with fresh keys |
| `ReceiptAgent.continueFrom(receipts)` | Resume from a verified receipt chain |
| `agent.readFile(path, content)` | Record a file read |
| `agent.callApi(endpoint, response)` | Record an API call |
| `agent.callLlm(prompt, response)` | Record an LLM inference |
| `agent.decide(reasoning, decision)` | Record a decision |
| `agent.produceOutput(desc, output)` | Record a produced output |
| `agent.toolCall(name, input)` | Record a tool invocation |
| `agent.toolResult(name, result)` | Record a tool result |
| `agent.messageSend(recipient, content)` | Record a message sent |
| `agent.reviewUsefulness(summary, result)` | Record a usefulness review (quality scoring) |
| `agent.verifyOwnChain()` | Verify the agent's chain integrity |
| `agent.getReceipts()` | Get all receipts in the chain |
| `agent.getChain()` | Get the underlying ReceiptChain |

### Integration Exports

```typescript
import { AxlTransport } from 'agenticproof/integrations/axl';
import { anchorOnChain } from 'agenticproof/integrations/0g-chain';
import { uploadToStorage } from 'agenticproof/integrations/0g-storage';
```

## Multi-Agent Handoff

Agents can hand off work with full cryptographic provenance using `ReceiptChain.toHandoffBundle()` and Gensyn AXL for P2P transport.

```typescript
import { ReceiptAgent } from 'agenticproof';
import { AxlTransport } from 'agenticproof/integrations/axl';

// Agent A: researcher
const researcher = ReceiptAgent.create('researcher');
researcher.callApi('https://api.data.org/fetch', '{"items": 100}');
researcher.callLlm('Analyze trends', 'Three key trends identified.');

const bundle = researcher.getChain().toHandoffBundle('researcher');
const axl = new AxlTransport();
const peers = await axl.discoverPeers();
await axl.sendHandoff(peers[0], researcher.getReceipts(), researcher.getPublicKey(), bundle);

// Agent B: builder (receives and continues the chain)
const incoming = await axl.waitForHandoff();
const builder = ReceiptAgent.continueFrom(incoming.bundle.receipts);
builder.decide('Implement trend #1', 'Building feature based on research.');
```

## Claude Code Hooks

Generate hook configuration to automatically produce receipts for every Claude Code session:

```bash
npx agenticproof init --claude-code
```

## OpenClaw Plugin

RECEIPT ships with a native OpenClaw plugin for automated receipt generation in OpenClaw-managed agents. See the `packages/openclaw-plugin` directory in the monorepo.

## On-Chain Anchoring

Anchor receipt chain root hashes to 0G Mainnet for permanent, verifiable proof of agent work:

```typescript
import { anchorOnChain } from 'agenticproof/integrations/0g-chain';

const result = await anchorOnChain(rootHash, storageRootHash, {
  rpc: 'https://evmrpc.0g.ai',
  contractAddress: '0x73B9A7768679B154D7E1eC5F2570a622A3b49651',
  privateKey: process.env.PRIVATE_KEY,
  chainId: 16661,
  usefulnessScore: 82,
});
console.log('Anchored:', result.txHash);
```

## License

MIT
