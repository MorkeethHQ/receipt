# R.E.C.E.I.P.T.

### Record of Every Computational Event with Immutable Proof and Trust

**Two-layer proof for agent work.** Signed, hash-linked receipts for verifiable AI agent handoffs — with TEE-attested quality scoring.

**Layer 1 — Proof of Action.** Every agent action — reading a file, calling an API, running inference, making a decision — produces a cryptographically signed receipt (ed25519 + SHA-256). Receipts hash-link into a tamper-proof chain. Any modification breaks the chain. When The Builder receives work from The Researcher, it independently verifies every receipt before continuing.

**Layer 2 — Proof of Usefulness.** After verification, a TEE-attested LLM review scores the chain's output quality on three axes: alignment, substance, and quality (each 0-100). The review itself becomes a signed receipt — so the quality assessment is as tamper-proof as the work it evaluates.

**Why TEE matters here.** The review must be trustworthy. A regular LLM call could be spoofed — an operator could fake high scores. 0G Compute TEE attestation (Intel TDX) means the scoring ran inside a hardware enclave and can't be fabricated. Operators get cryptographic proof that an unbiased model evaluated the work.

**The feedback loop.** Usefulness scores anchor on-chain alongside the receipt hash — creating on-chain agent reputation. Only chains scoring above a quality threshold become fine-tuning data. The system self-improves: good agent work trains better agents, bad work is excluded. All five 0G pillars (Compute, Storage, Chain, Fine-Tuning, Agentic ID) work as a coherent system, not separate integrations.

**Deployed Contracts:**
- ReceiptAnchorV2: [`0x73B9A7768679B154D7E1eC5F2570a622A3b49651`](https://chainscan-newton.0g.ai/address/0x73B9A7768679B154D7E1eC5F2570a622A3b49651) (0G Mainnet) — stores usefulness scores on-chain
- ReceiptAnchor v1: [`0x53D96861a37e82FF174324872Fc4d037a61520e3`](https://chainscan-newton.0g.ai/address/0x53D96861a37e82FF174324872Fc4d037a61520e3) (0G Mainnet)
- AgentNFT v2: [`0xf964d45c3Ea5368918B1FDD49551E373028108c9`](https://chainscan-newton.0g.ai/address/0xf964d45c3Ea5368918B1FDD49551E373028108c9) (0G Mainnet)
- Chain: 0G Mainnet, ID 16661, RPC `https://evmrpc.0g.ai`

## Architecture

```
The Researcher                    The Builder
  │                          │
  ├─ file_read → receipt₁    │
  ├─ api_call  → receipt₂    │
  ├─ llm_call  → receipt₃    │
  ├─ decision  → receipt₄    │
  ├─ output    → receipt₅    │
  │                          │
  └──── handoff bundle ──────┤   (via Gensyn AXL P2P)
                             ├─ verify chain (ed25519 + hash links)
                             ├─ file_read → receipt₆
                             ├─ api_call  → receipt₇
                             ├─ decision  → receipt₈
                             ├─ output    → receipt₉
                             └─ usefulness_review → receipt₁₀  (TEE-attested)
                                    │
                            compute root hash
                                    │
              ┌─────────────┬───────┼───────┬──────────────┐
              │             │               │              │
        0G Storage    0G Mainnet      0G Fine-Tune     AgentNFT
       (Merkle root)  (anchor tx)    (TEE upload)    (ERC-7857)
```

## How the 5 Pillars Connect

One pipeline run exercises every 0G integration. Here's exactly what happens:

**Step 1 — 0G Compute (TEE Inference)**
The Researcher requests LLM inference via `@0glabs/0g-serving-broker`. The broker routes to one of 4 provider addresses on 0G Mainnet. The response runs inside an Intel TDX hardware enclave. After inference, `broker.inference.processResponse(addr, chatId, usage)` verifies the TEE signature. The receipt carries attestation metadata: provider address, TEE type, chat ID, and a clickable signature endpoint URL.

**Step 2 — Receipt Chain**
The Researcher produces 5 receipts (file_read, api_call, llm_call, decision, output). Each is signed with ed25519 and hash-linked to the previous receipt via `prevId`. The chain is tamper-evident: changing any receipt breaks all downstream hash links.

**Step 3 — Gensyn AXL P2P Handoff**
The Researcher sends the receipt chain to The Builder over Gensyn's AXL transport layer. The pipeline imports `AxlTransport` from the SDK and attempts a real connection to the AXL HTTP bridge. If AXL is live: real `sendHandoffA2A()` with A2A JSON-RPC 2.0 envelope, real `callMcpTool()` for chain verification, real peer discovery via `topology()`. If AXL is unavailable: graceful fallback with `mode: 'simulated'` clearly marked. Agent card discovery uses the A2A agent card spec.

**Step 4 — Chain Verification + The Builder**
The Builder verifies every receipt: ed25519 signature validity, hash-link integrity, timestamp monotonicity. If any check fails, the handoff is rejected (demonstrated in adversarial mode). The Builder then extends the chain with 4 more receipts.

**Step 4b — Proof of Usefulness (0G Compute TEE)**
After producing its own receipts, the Builder evaluates the full chain's output quality via a second 0G Compute TEE call. Three axes — alignment, substance, quality — are scored 0-100. The review becomes a `usefulness_review` receipt carrying TEE attestation metadata, proving the quality assessment itself ran inside a trusted execution environment. This is architecturally essential: the TEE ensures the review is trustworthy, not just the actions.

**Step 5 — 0G Fine-Tuning (Quality-Gated)**
Only chains scoring ≥60/100 usefulness become training data. This is the feedback loop: Compute scores the work → Chain stores the score → Fine-Tuning only trains on high-quality chains → agents improve. The pipeline calls `listFineTuningProviders('https://evmrpc.0g.ai')` to discover available providers, then attempts `uploadDatasetToTEE()` and `createFineTuningTask()`. Chains below the quality threshold are excluded with an honest status message.

**Step 6 — 0G Storage**
The full receipt chain serializes to bytes, gets Merkle-treed via `@0gfoundation/0g-ts-sdk` v1.2.6, and uploads to 0G storage nodes. The turbo indexer discovers nodes; the pipeline selects 2 and falls back if the first fails. Upload produces a Merkle root hash and transaction hash.

**Step 7 — 0G Chain Anchor (with Usefulness Score)**
`ReceiptAnchorV2.sol` on 0G Mainnet (chain 16661) stores the chain root hash, storage reference, and usefulness score permanently via `anchorRoot(bytes32, bytes32, uint8)`. Anyone can query `getAnchor(chainRootHash)` on the explorer to see a chain's score. This creates on-chain agent reputation — not just proof that work happened, but a permanent record of how useful it was.

**Step 8 — ERC-7857 AgentNFT**
`AgentNFT.sol` mints an on-chain identity for the agent. The NFT carries two `iDatas` entries: the agent metadata hash (ed25519 public key + capabilities) and the chain root hash. Supports the full iNFT lifecycle: `mint()`, `transfer()`, `clone()`, `authorizeUsage()`.

## Live Demo

**[receipt-demo.vercel.app](https://receipt-demo.vercel.app)**

Four pages:
- **[Home](https://receipt-demo.vercel.app)** — Two-layer value prop, SDK install, quick start code with `reviewUsefulness()`
- **[Demo](https://receipt-demo.vercel.app/demo)** — Watch Researcher + Builder generate receipts in real-time, with usefulness scoring and adversarial tamper detection
- **[Verify](https://receipt-demo.vercel.app/verify)** — Independent chain verifier with valid and tampered example chains. Load a valid chain (real Ed25519 signatures), verify it passes, then load a tampered chain and watch it break
- **[Dashboard](https://receipt-demo.vercel.app/dashboard)** — Operator view: receipt timeline, usefulness review scores, 0G 5-pillar status, trust scoring, provider health

## Integrations

### 0G (Track 1: Framework/Tooling)

Full 0G stack integration across all five pillars, plus KV Store and LoRA deployment:

- **0G Compute** — TEE-attested inference via Intel TDX hardware enclaves, used twice: (1) Researcher's LLM analysis and (2) Builder's per-receipt usefulness review with weighted scoring. Each receipt gets a usefulness weight (0.0-1.0) showing WHERE the chain added value. Tries 4 providers with 2-pass retry and automatic fallback. Real `processResponse()` for TEE signature verification.
- **0G Storage + KV Store** — Content-addressed persistence via Merkle trees, plus `KvClient`/`StreamDataBuilder`/`Batcher` for agent reputation registry. After each pipeline run, the agent's usefulness score writes to a KV stream — creating a queryable on-chain reputation index.
- **0G Chain** — `ReceiptAnchorV2.sol` deployed on 0G Mainnet (chain ID 16661). `anchorRoot(bytes32, bytes32, uint8)` stores chain root hash, storage reference, and usefulness score permanently. Quality gate: chains scoring below 60/100 are NOT anchored — low-quality work doesn't earn on-chain reputation.
- **0G Fine-Tuning + LoRA Deployment** — Quality-gated: only chains scoring ≥60/100 become training data. After `createFineTuningTask()`, the pipeline attempts `resolveAdapterName()` → `deployAdapterByName()` to close the loop: train on good chains → deploy the tuned model → use it for future reviews.
- **0G Agentic ID (ERC-7857)** — Each agent mints an on-chain identity NFT carrying its ed25519 public key hash and receipt chain root as `iDatas`. `AgentNFT.sol` implements the iNFT standard with full lifecycle: mint, transfer, clone, authorizeUsage.

### Gensyn AXL (P2P Agent Communication)

Agent-to-agent handoffs over Gensyn's AXL peer-to-peer network. The pipeline imports `AxlTransport` from the receipt SDK and attempts real AXL connection. When AXL is live:

- Real topology discovery via `/topology`
- A2A agent card discovery via `/a2a/{peerId}`
- Handoff via `sendHandoffA2A()` with JSON-RPC 2.0 `SendMessage` envelope
- MCP tool calls via `callMcpTool()` (verify_chain, get_capabilities, get_chain_stats)
- Broadcast to all peers via `broadcastHandoff()`
- Rebroadcast of extended chain back to originator

When AXL is unavailable: graceful fallback with simulated events, clearly marked.

Standalone AXL demos:
- `demo/axl/sender.ts` — Creates receipt chain, sends handoff bundle to peer via AXL
- `demo/axl/receiver.ts` — Receives bundle, verifies chain, extends with new receipts

## Project Structure

```
packages/
  receipt-sdk/          Core SDK — types, crypto, chain, agent, verify, integrations
  receipt-cli/          CLI tool — run, verify, inspect, export, anchor commands

contracts/
  ReceiptAnchor.sol     On-chain anchor contract v1
  ReceiptAnchorV2.sol   V2 — stores usefulness scores on-chain (deployed on 0G Mainnet)
  AgentNFT.sol          ERC-7857 Agentic Identity NFT contract

scripts/
  deploy.ts             Deploy ReceiptAnchor
  deploy-agent-nft.ts   Deploy AgentNFT (ERC-7857) to 0G Mainnet

demo/
  app/                  Next.js demo — dashboard + narrative demo + AXL demo + verifier
  agents/               Standalone agent scripts (researcher → builder handoff)
  axl/                  Gensyn AXL P2P demo (sender + receiver via AxlTransport)
```

## SDK Usage — Verify + Review

```typescript
import { ReceiptAgent, verifyChain } from '@receipt/sdk';

// Researcher produces a receipt chain
const researcher = ReceiptAgent.create('researcher');
researcher.readFile('config.json', fileContents);
researcher.callApi('https://api.example.com', apiResponse);
researcher.callLlm('analyze this codebase', llmOutput);
researcher.decide('analysis reasoning', 'proceed with deployment');
researcher.produceOutput('research report', reportJson);

// Builder receives and verifies the chain
const builder = ReceiptAgent.continueFrom(researcher.getReceipts());
const results = verifyChain(researcher.getReceipts(), researcher.getPublicKey());
const allValid = results.every(r => r.valid); // true

// Builder does its own work
builder.readFile('handoff.json', handoffData);
builder.callApi('https://evmrpc.0g.ai', chainData);
builder.decide('deployment reasoning', 'deploy to 0G');
builder.produceOutput('deployment manifest', manifest);

// Layer 2: TEE-attested usefulness review
const scores = { alignment: 88, substance: 82, quality: 85 };
builder.reviewUsefulness(chainSummary, JSON.stringify(scores), teeAttestation);

// Full chain is now 10 receipts, all signed and hash-linked
console.log(builder.verifyOwnChain()); // true
```

## Quick Start

```bash
# Build SDK
cd packages/receipt-sdk && npm install && npm run build

# Run tests (47 passing)
npm test

# Run demo app
cd demo/app && npm install && npm run dev

# CLI
cd packages/receipt-cli && npm install && npm run build
npx receipt-agent run --task "Analyze codebase" --output chain.json
npx receipt-agent verify chain.json
npx receipt-agent inspect chain.json
```

## Standalone Agents

```bash
# Researcher creates chain, writes handoff to /tmp
npx tsx demo/agents/researcher.ts

# Builder reads handoff, verifies, extends chain
npx tsx demo/agents/builder.ts

# Adversarial mode — tampers receipt, builder refuses
npx tsx demo/agents/researcher.ts --adversarial
npx tsx demo/agents/builder.ts
```

## Environment Variables

```
PRIVATE_KEY=wallet_private_key
OG_CONTRACT_ADDRESS=0x73B9A7768679B154D7E1eC5F2570a622A3b49651
AGENT_NFT_ADDRESS=0xf964d45c3Ea5368918B1FDD49551E373028108c9
OG_COMPUTE_PROVIDER=0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C
AXL_BASE_URL=http://127.0.0.1:9002  # optional, for live AXL
```

## SDK — 47 Tests

```bash
cd packages/receipt-sdk && npm test
```

Covers: agent creation, all 6 action types (including usefulness_review), hash chain integrity, inputHash/outputHash correctness, ed25519 signature verification, tamper detection, `continueFrom` handoffs, `verifyChain` pass/fail, `computeRootHash`, training data conversion, fine-tuning attestation, AXL handoff payloads, serialization, crypto primitives, chain append validation, and attestation metadata.

## Built With

### AI Tools
- **Claude Code** (Anthropic) — Implementation, code generation, debugging, and iteration

### Human Contributions (Oscar)
- Architecture design — the receipt chain mechanic, hash-linking strategy, and multi-agent handoff protocol
- Product decisions — what to build, what to skip, scope management
- Integration strategy — choosing 0G 5-pillar integration (Compute + Storage + Chain + Fine-Tuning + Agentic ID), Gensyn AXL for P2P
- Bounty targeting — identifying the 2-sponsor strategy across 0G and Gensyn
- Demo direction — adversarial mode concept, the "fabrication detected" visual, chain explorer design
- Deployment and operations — contract deployment, Vercel configuration, environment setup

### Stack
- TypeScript, Next.js 15, ed25519 (@noble/ed25519), SHA-256 (@noble/hashes)
- Solidity (ReceiptAnchorV2.sol, AgentNFT.sol)
- 0G SDK (@0gfoundation/0g-ts-sdk v1.2.6, @0glabs/0g-serving-broker)
- Gensyn AXL (AxlTransport SDK wrapper, A2A protocol, MCP tool calls)

## Bounty Targets

| Sponsor | Track | Ceiling | What We Built |
|---------|-------|---------|---------------|
| **0G** | Track 1: Framework/Tooling | $2,500 1st | Two-layer proof: 5-pillar integration with dual TEE use (inference + usefulness review). Compute, Storage, Chain, Fine-Tuning, Agentic ID (ERC-7857) |
| **Gensyn** | AXL Integration | $2,500 1st | AxlTransport SDK, real P2P handoffs with live/simulated fallback, A2A protocol, MCP tool calls, peer discovery, broadcast |

## License

MIT
