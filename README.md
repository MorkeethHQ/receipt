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
  └──── handoff bundle ──────┤   (via Gensyn AXL P2P or direct)
                             ├─ verify chain (ed25519 + hash links)
                             ├─ file_read → receipt₆
                             ├─ llm_call  → receipt₇
                             ├─ decision  → receipt₈
                             └─ output    → receipt₉
                                    │
                            compute root hash
                                    │
              ┌─────────────┬──────┼──────┬──────────────┐
              │             │             │              │
        0G Storage    0G Mainnet    Base Sepolia    AgentNFT
       (Merkle root)  (anchor tx)   (anchor tx)   (ERC-7857)
```

## Live Demo

**[receipt-demo.vercel.app](https://receipt-demo.vercel.app)**

Two viewing modes:
- **Demo Mode** — Watch agents generate receipts in real-time with chain visualization, trust scoring, and adversarial tamper detection
- **Explorer Mode** — Full block-explorer view: every hash, every signature, raw input/output data, chain linkage arrows, root hash computation

Features:
- Real 0G Compute inference with TEE attestation (Intel TDX)
- Adversarial mode: toggle to watch Agent A fabricate data and Agent B catch it
- Trust Score: chain integrity (70%) + data provenance (15%) + TEE attestation (15%)
- ERC-7857 Agentic Identity minting
- Training data export (receipts → JSONL → 0G Fine-Tuning)
- Public verifier at `/verify` — paste any receipt chain JSON to verify independently

## Integrations

### 0G (Track 1: Framework/Tooling + Track 2: Autonomous Agents)

Full 0G stack integration across all five pillars:

- **0G Compute** — TEE-attested inference via Intel TDX hardware enclaves. LLM calls in the receipt chain carry attestation metadata proving the inference ran in a trusted execution environment. Tries 4 providers (DeepSeek-V3.2, GLM-5, GPT-oss-120B, GPT-5.4-mini) with automatic fallback.
- **0G Storage** — Content-addressed persistence. Receipt chains serialize to bytes, get Merkle-treed, and the root hash becomes the `storageRef` passed to the anchor contract. Real upload via `@0gfoundation/0g-ts-sdk` indexer.
- **0G Chain** — `ReceiptAnchor.sol` deployed on 0G Mainnet (chain ID 16661). `anchorRoot(bytes32, bytes32)` stores the chain root hash + storage reference permanently.
- **0G Fine-Tuning** — Receipt chains convert to JSONL training data via `chainToFineTuningDataset()`. Agent behavior (decisions, inferences, actions) becomes training examples for 0G's decentralized GPU network. Full lifecycle: `listFineTuningProviders()`, `createFineTuningTask()`, `uploadDatasetToTEE()`. Compatible with Qwen2.5-0.5B-Instruct and Qwen3-32B.
- **0G Agentic ID (ERC-7857)** — Each agent mints an on-chain identity NFT carrying its ed25519 public key hash and receipt chain root as `iDatas`. `AgentNFT.sol` implements the INFT standard for AI agent identity.

### Gensyn AXL (P2P Agent Communication)

Agent-to-agent handoffs over Gensyn's AXL peer-to-peer network. No centralized server — agents discover each other via AXL topology, send receipt bundles directly, and the receiving agent verifies before extending.

- `sender.ts` — Creates receipt chain, sends handoff bundle to peer via AXL
- `receiver.ts` — Receives bundle, verifies chain, extends with new receipts

### KeeperHub (Automated Anchoring)

KeeperHub workflows trigger automated anchoring:

1. Webhook trigger fires every 10 minutes
2. Handler scans for unanchored chains
3. Verifies → stores to 0G → anchors on both chains

See [FEEDBACK.md](./FEEDBACK.md) for detailed integration feedback.

## Project Structure

```
packages/
  receipt-sdk/          Core SDK — types, crypto, chain, agent, verify, integrations
  receipt-cli/          CLI tool — run, verify, inspect, export, anchor commands

contracts/
  ReceiptAnchor.sol     On-chain anchor contract (deployed on 0G Mainnet + Base Sepolia)
  AgentNFT.sol          ERC-7857 Agentic Identity NFT contract

scripts/
  deploy.ts             Deploy ReceiptAnchor to multiple chains
  deploy-agent-nft.ts   Deploy AgentNFT (ERC-7857) to 0G Mainnet

demo/
  app/                  Next.js demo — live receipt generation + verification + explorer
  agents/               Standalone agent scripts (researcher → builder handoff)
  axl/                  Gensyn AXL P2P demo (sender + receiver via AxlTransport)
  keeperhub/            KeeperHub webhook + workflow setup + auto-anchor
```

## Quick Start

```bash
# Build SDK
cd packages/receipt-sdk && npm install && npm run build

# Run tests
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

## Contract Deployment

Contract addresses (deployed fresh during hackathon):
- **0G Mainnet:** `0x8228af81d872d027632C8f55a53EbE7bf5872667`
- **Base Sepolia:** `0x3118063e34ED57DB38872C2f213257E7fe90010C`

Wallet: `0x4fD66BdA6d792bE89d1fAeaF9F287AcaCaDBDce6`

## Environment Variables

```
PRIVATE_KEY=wallet_private_key
OG_CONTRACT_ADDRESS=0g_mainnet_receipt_anchor
BASE_CONTRACT_ADDRESS=base_sepolia_receipt_anchor
AGENT_NFT_ADDRESS=0g_mainnet_agent_nft
KEEPERHUB_API_KEY=your_api_key
```

## SDK — 47 Tests

```bash
cd packages/receipt-sdk && npm test
```

Covers: agent creation, all 5 action types, hash chain integrity, inputHash/outputHash correctness, ed25519 signature verification, tamper detection, `continueFrom` handoffs, `verifyChain` pass/fail, `computeRootHash`, training data conversion, serialization, crypto primitives, chain append validation, and attestation metadata.

## Built With

### AI Tools
- **Claude Code** (Anthropic) — Implementation, code generation, debugging, and iteration

### Human Contributions (Oscar)
- Architecture design — the receipt chain mechanic, hash-linking strategy, and multi-agent handoff protocol
- Product decisions — what to build, what to skip, scope management
- Integration strategy — choosing 0G 5-pillar integration (Compute + Storage + Chain + Fine-Tuning + Agentic ID), Gensyn AXL for P2P, KeeperHub for scheduling
- Bounty targeting — identifying the 3-sponsor, $17.5K ceiling strategy across 0G, KeeperHub, and Gensyn
- Demo direction — adversarial mode concept, the "fabrication detected" visual, chain explorer design
- Deployment and operations — contract deployment, Vercel configuration, environment setup

### Stack
- TypeScript, Next.js 15, ed25519 (@noble/ed25519), SHA-256 (@noble/hashes)
- Solidity (ReceiptAnchor.sol, AgentNFT.sol)
- 0G SDK (@0gfoundation/0g-ts-sdk, @0glabs/0g-serving-broker)
- Gensyn AXL (Go binary, HTTP API, AxlTransport SDK wrapper)
- KeeperHub (REST API, webhook handler, auto-anchor workflow)

## Bounty Targets

| Sponsor | Track | Ceiling | What We Built |
|---------|-------|---------|---------------|
| **0G** | Track 1: Framework/Tooling | $7,500 | 5-pillar integration: Compute (TEE), Storage (Merkle), Chain (anchor), Fine-Tuning (JSONL pipeline), Agentic ID (ERC-7857) |
| **Gensyn** | AXL Integration | $5,000 | AxlTransport SDK, P2P receipt handoffs, peer discovery, sender/receiver demos |
| **KeeperHub** | Automated Workflow | $4,500 + $500 | Webhook-triggered anchor pipeline, workflow setup, auto-anchor CLI, 1,681-word FEEDBACK.md |

## License

MIT
