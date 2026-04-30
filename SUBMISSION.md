# R.E.C.E.I.P.T. — ETHGlobal Open Agents Submission

## One-liner

Two-layer proof for AI agent work: cryptographic receipt chains (Layer 1) with TEE-attested quality scoring (Layer 2) — every action verifiable, every output scored, anchored on-chain.

## Problem

AI agents are black boxes. When Agent A hands work to Agent B, there's no way to verify what A actually did. Did it read the right file? Call the right API? Did the LLM response come from a trusted environment? And even if it did — was the output actually useful?

Multi-agent workflows have two trust gaps:
1. **Proof of Action** — did the agent do what it claims?
2. **Proof of Usefulness** — was the work worth the cost?

Existing tools (LangSmith, AgentOps, OpenTelemetry) answer the first poorly and the second not at all. Academic papers on agent verification (zkAgent, PunkGo) explicitly punt quality scoring as "future work."

## Solution

R.E.C.E.I.P.T. is a two-layer proof system:

**Layer 1 — Proof of Action.** Every agent action produces a cryptographically signed receipt (ed25519 + SHA-256). Receipts hash-link into a tamper-evident chain. If any receipt is modified, the chain breaks. When The Builder receives work from The Researcher, it independently verifies every receipt before continuing.

**Layer 2 — Proof of Usefulness.** A TEE-attested model (selected inside the enclave, not by the agent) scores the entire chain on alignment, substance, and quality. The agent can't pick its own grader. Chains below the quality threshold aren't anchored — you don't get on-chain credit for bad work.

## What We Built

### Core SDK (`agenticproof` on npm)
- `ReceiptAgent` — create agents, record actions, produce signed receipts
- `ReceiptChain` — hash-linked chain with root hash computation
- `verifyChain()` — independent verification of any receipt chain
- `continueFrom()` — Agent B extends Agent A's verified chain
- 47 tests, published as agenticproof@0.1.1

### 0G Integration (Full Stack)
1. **Compute** — TEE-attested LLM inference via Intel TDX (DeepSeek V3, GLM-5)
2. **Storage** — Merkle tree persistence via 0G Storage SDK
3. **Chain** — `ReceiptAnchorV2.sol` on 0G Mainnet (16661) — root hash + usefulness score anchored permanently
4. **Agentic ID (ERC-7857)** — `AgentNFT.sol` mints soulbound identity tokens carrying the agent's ed25519 key hash and chain root
5. **Validation (ERC-8004)** — `ValidationRegistry.sol` posts usefulness attestations on-chain
6. **Fine-Tuning** — Receipt chains → JSONL → 0G Fine-Tuning pipeline. Train models on verified, quality-scored agent behavior.

### Gensyn AXL (P2P Agent Handoff)
- `AxlTransport` SDK class wrapping AXL's P2P API
- Two AXL nodes deployed on VPS as systemd services with nginx proxy
- Researcher → Builder handoff over encrypted P2P mesh
- Full provenance preserved through transport

### Demo App (5 Pages)
- **Live Demo** — Watch 2 agents generate receipts in real-time. Honest mode catches fabricated actions; adversarial mode shows RECEIPT detecting a lie ("I didn't actually open the file, I assumed the data")
- **Team** — Multi-agent chain feed aggregating receipt chains from Claude Code hooks + OpenClaw plugin. Filter by source, inspect receipt timelines, verify any chain
- **Verify** — Independent chain verifier using WebCrypto (client-side, real ed25519 + SHA-256). Paste any chain — authentic or tampered — and see exactly which receipts fail
- **Eval** — Constitutional AI evaluation harness (60 test cases, 3 model evaluators, self-critique)

### Contracts (All on 0G Mainnet)
- ReceiptAnchorV2: `0x73B9A7768679B154D7E1eC5F2570a622A3b49651`
- AgentNFT: `0xf964d45c3Ea5368918B1FDD49551E373028108c9`
- ValidationRegistry: `0x2E32E845928A92DB193B59676C16D52923Fa01dd`

## How It's Different

| Approach | Tamper-proof | Multi-agent | Quality Score | On-chain | Training |
|----------|-------------|-------------|---------------|----------|----------|
| Logging | No | No | No | No | No |
| LangSmith / AgentOps | No | Partial | No | No | No |
| **R.E.C.E.I.P.T.** | **Yes (ed25519 + SHA-256)** | **Yes (verified handoffs)** | **Yes (TEE-attested)** | **Yes (0G Mainnet)** | **Yes (0G Fine-Tuning)** |

## Team

- **Oscar** — Architecture, product, integration strategy, deployment
- **Claude Code** (Anthropic) — Implementation partner

## Links

- **Live Demo:** [receipt-murex.vercel.app](https://receipt-murex.vercel.app)
- **Repo:** [github.com/MorkeethHQ/receipt](https://github.com/MorkeethHQ/receipt)
- **SDK:** [npmjs.com/package/agenticproof](https://www.npmjs.com/package/agenticproof)
- **Verifier:** [receipt-murex.vercel.app/verify](https://receipt-murex.vercel.app/verify)
