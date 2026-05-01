# RECEIPT - Agent Evaluation Layer

## What this project does

RECEIPT is the evaluation and measurement layer for AI agent harnesses. It answers: "Did the agent actually do the work, and was the output worth paying for?"

Every agent action (file read, API call, LLM inference, decision) produces a cryptographically signed receipt (Ed25519 + SHA-256). Receipts hash-link into a tamper-evident chain. A separate TEE-attested model scores usefulness. The result anchors on-chain.

## Key metric

**Verification rate**: what percentage of agent-claimed actions pass independent multi-agent verification. The Researcher produces receipts. The Builder independently verifies every one before continuing. One failure = entire handoff rejected.

## Two proof layers

1. **Proof of Action** - Ed25519-signed receipts, SHA-256 hash-linked chain, multi-agent verification at handoff
2. **Proof of Usefulness** - TEE-attested quality scoring (alignment, substance, quality, each 0-100). Quality gate at 60/100. Below threshold = not anchored on-chain, not eligible for training data.

## 0G integration (5 modules)

| Module | What RECEIPT uses it for | Code location |
|--------|------------------------|---------------|
| **Compute** | TEE-attested inference via Intel TDX enclaves. DeepSeek V3 for research, GLM-5 for quality review. Uses `@0glabs/0g-serving-broker`, calls `processResponse()` for attestation verification. Multi-provider fallback (4 addresses). | `demo/app/app/api/builder/route.ts` lines 21-90, `demo/app/app/api/researcher/route.ts` |
| **Chain** | 3 smart contracts on 0G Mainnet (chain ID 16661). ReceiptAnchorV2 stores chain root hash + usefulness score. AgentNFT (ERC-7857) mints agent identity. ValidationRegistry (ERC-8004) posts quality attestations. | `contracts/*.sol`, `packages/receipt-sdk/src/integrations/0g-chain.ts` |
| **Storage** | Content-addressed persistence via Merkle trees. Receipt chains serialize to bytes, get Merkle-treed, upload to 0G storage nodes. | `packages/receipt-sdk/src/integrations/0g-storage.ts` |
| **KV Store** | Agent reputation registry. Each run writes usefulness score to queryable KV stream. | `packages/receipt-sdk/src/integrations/0g-kv.ts` |
| **Fine-Tuning** | Quality-gated training pipeline. Only chains scoring >=60/100 produce training-eligible JSONL. Discovers providers, uploads via TEE. | `packages/receipt-sdk/src/integrations/0g-fine-tuning.ts`, `packages/receipt-sdk/src/integrations/training-data.ts` |

## Gensyn AXL integration

Agent-to-agent transport via P2P Yggdrasil mesh. Two VPS nodes running at 204.168.133.192. Peer discovery, A2A agent cards, JSON-RPC 2.0 handoff, MCP tool calls, broadcast. Falls back to direct HTTP when P2P unavailable.

Code: `packages/receipt-sdk/src/integrations/axl.ts` (401 lines)

## Smart contracts (deployed, live on 0G Mainnet)

| Contract | Address | Standard |
|----------|---------|----------|
| ReceiptAnchorV2 | `0x73B9A7768679B154D7E1eC5F2570a622A3b49651` | Custom |
| AgentNFT | `0xf964d45c3Ea5368918B1FDD49551E373028108c9` | ERC-7857 |
| ValidationRegistry | `0x2E32E845928A92DB193B59676C16D52923Fa01dd` | ERC-8004 |

Explorer: https://chainscan.0g.ai

## SDK

Published on npm as `agenticproof` (v0.1.2). 47 tests passing.

```bash
npm install agenticproof
```

```typescript
import { ReceiptAgent, verifyChain } from 'agenticproof';

const agent = ReceiptAgent.create('my-agent');
agent.readFile(path, contents);       // receipt #1
agent.callApi(url, response);         // receipt #2, linked to #1
agent.callLlm(prompt, output);        // receipt #3, linked to #2
agent.decide(reasoning, conclusion);  // receipt #4, linked to #3
agent.produceOutput(label, data);     // receipt #5, linked to #4

const chain = agent.exportChain();    // verify at /verify
```

Works with: Claude Code (hooks), Cursor (file watcher), OpenClaw (native plugin), any custom agent (SDK wrapper).

## Demo

Live at https://receipt-murex.vercel.app

| Page | URL | What it does |
|------|-----|-------------|
| Landing | `/` | Problem, solution, verification stack, SDK snippet |
| Demo | `/demo` | Real-time Researcher + Builder pipeline. Honest mode + adversarial tamper detection. SSE streaming. |
| Verify | `/verify` | Client-side chain verification via WebCrypto (Ed25519 + SHA-256). No server. |
| Eval | `/eval` | Constitutional AI evaluation harness. 60 test cases, 3 model evaluators, self-critique, consensus. |
| Trial | `/trial` | Execution replay with timeline, token/time/quality metrics, human review as receipt #11. |
| Team | `/team` | Multi-agent chain feed aggregating from Claude Code + OpenClaw + demo. |

## Project structure

```
packages/receipt-sdk/       SDK (npm: agenticproof) - types, crypto, chain, agent, verify, integrations
packages/receipt-cli/       CLI - run, verify, inspect, export, anchor
packages/openclaw-plugin/   OpenClaw plugin - lifecycle hooks for automatic receipting
contracts/                  Solidity - ReceiptAnchorV2, AgentNFT, ValidationRegistry
demo/app/                   Next.js 15 demo - landing, demo, verify, eval, trial, team
demo/agents/                Standalone agent scripts
demo/axl/                   Gensyn AXL P2P demo (sender + receiver)
```

## How to run locally

```bash
git clone https://github.com/MorkeethHQ/receipt
cd receipt/packages/receipt-sdk && npm install && npm test    # 47 tests
cd ../../demo/app && npm install && npm run dev               # http://localhost:3000
```

Requires `.env.local` with: PRIVATE_KEY, OG_CONTRACT_ADDRESS, AGENT_NFT_ADDRESS, VALIDATION_REGISTRY_ADDRESS, OG_COMPUTE_PROVIDER, AXL_BASE_URL, AXL_AUTH_TOKEN, ANTHROPIC_API_KEY

## Technical details

- **Cryptography**: Ed25519 via @noble/ed25519, SHA-256 via @noble/hashes
- **Chain integrity**: Each receipt's `prevId` = previous receipt's `id`. Root hash = SHA-256 of final receipt fields. Change any receipt and the chain breaks.
- **TEE attestation**: Intel TDX via 0G Compute. `broker.inference.processResponse()` verifies enclave signatures. Reverse-engineered from 0G SDK source (undocumented call).
- **Quality gate**: Composite score = average(alignment, substance, quality). Threshold = 60/100. Below = not anchored, not training-eligible.
- **Client-side verification**: WebCrypto API (crypto.subtle) for Ed25519 verify + SHA-256 digest. Zero server dependency.

## What makes this different

Every existing agent observability tool (LangSmith, AgentOps, Patronus, Galileo) answers "did the agent run." None answer "was the output worth what you paid" with cryptographic proof. Academic papers (zkAgent, PunkGo) punt quality scoring as future work. RECEIPT is the first to combine tamper-proof action logging with TEE-attested usefulness scoring, anchored on-chain.
