# R.E.C.E.I.P.T. — ETHGlobal Open Agents Submission

## One-liner

Cryptographic proof layer that makes every AI agent action verifiable — signed receipts, hash-linked chains, and on-chain anchoring.

## Problem

AI agents are black boxes. When Agent A hands work to Agent B, there's no way to verify what Agent A actually did. Did it read the right file? Call the right API? Did the LLM response come from a trusted environment? Multi-agent workflows have a trust gap — and existing solutions (logging, audit trails) are trivially forgeable.

## Solution

R.E.C.E.I.P.T. is a proof layer for agent work. Every action produces a cryptographically signed receipt:

- **ed25519 signatures** — each agent has a keypair; every receipt is signed
- **SHA-256 hash chains** — each receipt includes the previous receipt's hash, creating a tamper-evident chain
- **Input/output hashing** — what went in and what came out are independently hashable
- **Multi-agent handoffs** — Agent B verifies Agent A's entire chain before accepting

If any receipt is tampered with, the chain breaks. The demo's adversarial mode shows this live: toggle it on, watch Agent A fabricate an API response, and watch Agent B catch the lie instantly.

## What We Built

### Core SDK (`@receipt/sdk`)
- `ReceiptAgent` — create agents, record actions, produce receipts
- `ReceiptChain` — hash-linked chain with root hash computation
- `verifyChain()` — independent verification of any receipt chain
- `continueFrom()` — Agent B extends Agent A's verified chain
- 47 tests covering all action types, tamper detection, crypto primitives

### 0G Integration (5 Pillars)
1. **Compute** — TEE-attested LLM inference via Intel TDX. 4 provider fallback chain.
2. **Storage** — Merkle tree persistence via `@0gfoundation/0g-ts-sdk`
3. **Chain** — `ReceiptAnchor.sol` on 0G Mainnet (16661). Root hash + storage ref anchored permanently.
4. **Fine-Tuning** — Receipt chains → JSONL → 0G Fine-Tuning. Train models on verified agent behavior.
5. **Agentic ID (ERC-7857)** — `AgentNFT.sol` mints identity tokens carrying the agent's ed25519 key hash and chain root.

### Gensyn AXL
- `AxlTransport` SDK class wrapping AXL's P2P HTTP API
- Peer discovery, handoff send/receive over the mesh network
- Full sender/receiver demos with chain verification

### KeeperHub
- Webhook-triggered anchor pipeline: verify → store → anchor on both chains
- Auto-anchor CLI with poll mode
- Workflow setup script with visual node positions
- 1,681-word FEEDBACK.md (7/10 rating, 5 friction points, 5 improvement suggestions)

### Demo App
- **Demo Mode** — Watch 2 agents generate 9 receipts in real-time
- **Explorer Mode** — Full block-explorer: every hash, signature, raw I/O, chain linkage
- **Adversarial Mode** — Agent A fabricates data, Agent B catches it
- **Trust Score** — Chain integrity (70%) + data provenance (15%) + TEE attestation (15%)
- **Public Verifier** — `/verify` page for independent chain verification
- Training data export (JSONL download)

## How It's Different

| Approach | Tamper-proof | Multi-agent | On-chain | Training pipeline |
|----------|-------------|-------------|----------|-------------------|
| Logging | No | No | No | No |
| OpenTelemetry | No | Partial | No | No |
| **R.E.C.E.I.P.T.** | **Yes (ed25519 + SHA-256)** | **Yes (verified handoffs)** | **Yes (0G + Base)** | **Yes (0G Fine-Tuning)** |

## Team

- **Oscar** — Architecture, product, integration strategy, deployment
- **Claude Code** (Anthropic) — Implementation

## Links

- **Demo:** [receipt-demo.vercel.app](https://receipt-demo.vercel.app)
- **Repo:** [github.com/MorkeethHQ/receipt](https://github.com/MorkeethHQ/receipt)
- **Verifier:** [receipt-demo.vercel.app/verify](https://receipt-demo.vercel.app/verify)
