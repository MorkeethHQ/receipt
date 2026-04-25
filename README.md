# R.E.C.E.I.P.T.

### Record of Every Computational Event with Immutable Proof and Trust

**Proof layer for agent work.** Signed, hash-linked receipts for verifiable AI agent handoffs.

Every action an AI agent takes — reading a file, calling an API, running inference, making a decision — produces a cryptographically signed receipt. Receipts chain together via hash links. When Agent B receives work from Agent A, it independently verifies the entire chain before continuing. If any receipt has been tampered with, the chain breaks and Agent B refuses the handoff.

Receipt chains anchor on-chain for permanent, public verifiability.

## Architecture

```
Agent A                    Agent B
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
                             └─ output    → receipt₉
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
Agent A requests LLM inference via `@0glabs/0g-serving-broker`. The broker routes to one of 4 provider addresses on 0G Mainnet. The response runs inside an Intel TDX hardware enclave. After inference, `broker.inference.processResponse(addr, chatId, usage)` verifies the TEE signature. The receipt carries attestation metadata: provider address, TEE type, chat ID, and a clickable signature endpoint URL.

**Step 2 — Receipt Chain**
Agent A produces 5 receipts (file_read, api_call, llm_call, decision, output). Each is signed with ed25519 and hash-linked to the previous receipt via `prevId`. The chain is tamper-evident: changing any receipt breaks all downstream hash links.

**Step 3 — Gensyn AXL P2P Handoff**
Agent A sends the receipt chain to Agent B over Gensyn's AXL transport layer. The pipeline imports `AxlTransport` from the SDK and attempts a real connection to the AXL HTTP bridge. If AXL is live: real `sendHandoffA2A()` with A2A JSON-RPC 2.0 envelope, real `callMcpTool()` for chain verification, real peer discovery via `topology()`. If AXL is unavailable: graceful fallback with `mode: 'simulated'` clearly marked. Agent card discovery uses the A2A agent card spec.

**Step 4 — Chain Verification + Agent B**
Agent B verifies every receipt: ed25519 signature validity, hash-link integrity, timestamp monotonicity. If any check fails, the handoff is rejected (demonstrated in adversarial mode). Agent B then extends the chain with 4 more receipts.

**Step 5 — 0G Fine-Tuning**
The combined 9-receipt chain converts to JSONL training data via `chainToFineTuningDataset()`. The pipeline calls `listFineTuningProviders('https://evmrpc.0g.ai')` to discover available providers, then attempts `uploadDatasetToTEE()` and `createFineTuningTask()` with the real 0G serving broker. Results are displayed honestly: task created, or "no providers available" if none exist on mainnet.

**Step 6 — 0G Storage**
The full receipt chain serializes to bytes, gets Merkle-treed via `@0gfoundation/0g-ts-sdk` v1.2.6, and uploads to 0G storage nodes. The turbo indexer discovers nodes; the pipeline selects 2 and falls back if the first fails. Upload produces a Merkle root hash and transaction hash.

**Step 7 — 0G Chain Anchor**
`ReceiptAnchor.sol` on 0G Mainnet (chain 16661) stores the chain root hash + storage reference permanently via `anchorRoot(bytes32, bytes32)`.

**Step 8 — ERC-7857 AgentNFT**
`AgentNFT.sol` mints an on-chain identity for the agent. The NFT carries two `iDatas` entries: the agent metadata hash (ed25519 public key + capabilities) and the chain root hash. Supports the full iNFT lifecycle: `mint()`, `transfer()`, `clone()`, `authorizeUsage()`.

**Deployed Contracts:**
- ReceiptAnchor: `0x53D96861a37e82FF174324872Fc4d037a61520e3` (0G Mainnet)
- AgentNFT v2: `0xf964d45c3Ea5368918B1FDD49551E373028108c9` (0G Mainnet)
- Chain: 0G Mainnet, ID 16661, RPC `https://evmrpc.0g.ai`

## Live Demo

**[receipt-demo.vercel.app](https://receipt-demo.vercel.app)**

Three viewing modes:
- **Dashboard** — Full operator view: receipt timeline, 0G 5-pillar status, AXL network topology, trust scoring, provider health
- **Demo Mode** — Watch agents generate receipts in real-time with narrative explanations and adversarial tamper detection
- **AXL Demo** — Interactive side-by-side sender/receiver visualization of the Gensyn AXL P2P handoff

Features:
- Real 0G Compute inference with TEE attestation (Intel TDX)
- Adversarial mode: toggle to watch Agent A fabricate data and Agent B catch it
- Trust Score: chain integrity (70%) + data provenance (15%) + TEE attestation (15%)
- ERC-7857 Agentic Identity minting
- Real fine-tuning pipeline (provider discovery → TEE upload → task creation)
- Training data export (receipts → JSONL)
- Public verifier at `/verify` — paste any receipt chain JSON to verify independently
- AXL live/simulated mode indicator

## Integrations

### 0G (Track 1: Framework/Tooling)

Full 0G stack integration across all five pillars:

- **0G Compute** — TEE-attested inference via Intel TDX hardware enclaves. LLM calls in the receipt chain carry attestation metadata proving the inference ran in a trusted execution environment. Tries 4 providers with 2-pass retry and automatic fallback. Real `processResponse()` for TEE signature verification.
- **0G Storage** — Content-addressed persistence. Receipt chains serialize to bytes, get Merkle-treed via `@0gfoundation/0g-ts-sdk` v1.2.6, and upload to discovered storage nodes. Turbo indexer with fallback node selection. Real upload transactions with Merkle root hashes.
- **0G Chain** — `ReceiptAnchor.sol` deployed on 0G Mainnet (chain ID 16661). `anchorRoot(bytes32, bytes32)` stores the chain root hash + storage reference permanently. Explorer links for every transaction.
- **0G Fine-Tuning** — Real broker calls: `listFineTuningProviders()` discovers available providers, `uploadDatasetToTEE()` uploads JSONL training data to TEE, `createFineTuningTask()` submits the job. Honest status reporting — shows what actually happened.
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
  ReceiptAnchor.sol     On-chain anchor contract (deployed on 0G Mainnet)
  AgentNFT.sol          ERC-7857 Agentic Identity NFT contract

scripts/
  deploy.ts             Deploy ReceiptAnchor
  deploy-agent-nft.ts   Deploy AgentNFT (ERC-7857) to 0G Mainnet

demo/
  app/                  Next.js demo — dashboard + narrative demo + AXL demo + verifier
  agents/               Standalone agent scripts (researcher → builder handoff)
  axl/                  Gensyn AXL P2P demo (sender + receiver via AxlTransport)
```

## Quick Start

```bash
# Build SDK
cd packages/receipt-sdk && npm install && npm run build

# Run tests (94 passing)
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
OG_CONTRACT_ADDRESS=0x53D96861a37e82FF174324872Fc4d037a61520e3
AGENT_NFT_ADDRESS=0xf964d45c3Ea5368918B1FDD49551E373028108c9
OG_COMPUTE_PROVIDER=0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C
AXL_BASE_URL=http://127.0.0.1:9002  # optional, for live AXL
```

## SDK — 94 Tests

```bash
cd packages/receipt-sdk && npm test
```

Covers: agent creation, all 5 action types, hash chain integrity, inputHash/outputHash correctness, ed25519 signature verification, tamper detection, `continueFrom` handoffs, `verifyChain` pass/fail, `computeRootHash`, training data conversion, fine-tuning attestation, AXL handoff payloads, serialization, crypto primitives, chain append validation, and attestation metadata.

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
- Solidity (ReceiptAnchor.sol, AgentNFT.sol)
- 0G SDK (@0gfoundation/0g-ts-sdk v1.2.6, @0glabs/0g-serving-broker)
- Gensyn AXL (AxlTransport SDK wrapper, A2A protocol, MCP tool calls)

## Bounty Targets

| Sponsor | Track | Ceiling | What We Built |
|---------|-------|---------|---------------|
| **0G** | Track 1: Framework/Tooling | $2,500 1st | 5-pillar integration: Compute (TEE), Storage (Merkle), Chain (anchor), Fine-Tuning (real broker calls), Agentic ID (ERC-7857) |
| **Gensyn** | AXL Integration | $2,500 1st | AxlTransport SDK, real P2P handoffs with live/simulated fallback, A2A protocol, MCP tool calls, peer discovery, broadcast |

## License

MIT
