# RECEIPT — ETHGlobal Open Agents Submission Package

Everything you need to submit. Walk through this file top to bottom.

---

## 1. IMAGES (ready to upload)

| File | What | Size |
|------|------|------|
| `logo-512x512.png` | Logo/avatar | 512x512 |
| `cover-1920x1080.png` | Cover image (16:9) | 1920x1080 |
| `screenshots/` | Capture these during demo recording (see below) |

### Screenshots still needed (capture from production):
1. **idle.png** — Demo page before clicking Start (mode selector visible)
2. **running.png** — Mid-pipeline, receipts appearing
3. **done-honest.png** — Completed honest run (quality score, 0G verification, TX links)
4. **done-adversarial.png** — Completed adversarial run (REJECTED stamp, red)
5. **verify.png** — Verify page with green checkmarks

How: Open `receipt-murex.vercel.app/demo` in Chrome at 1920x1080, Cmd+Shift+4.

---

## 2. SHORT DESCRIPTION (100 chars max)

```
Keep rate for agent work beyond code — cryptographic proof that AI outputs were actually useful.
```
96 characters.

---

## 3. LONG DESCRIPTION (min 200 words)

The problem with AI agents today isn't capability — it's trust. When you deploy an agent to do research, execute transactions, analyze data, or generate content, you're taking the agent's word for it. Did it actually read the right file, or did it hallucinate the contents? Did it call the real API, or skip the call and fabricate a response? And even if it did the work honestly — was the output worth what you paid?

Cursor solved this for code. They built keep rates — measuring what percentage of agent-generated code survives after an hour, a day, a week. It's the single best signal for whether code work was useful. But code has an unfair advantage: you can diff it, compile it, run tests. There's a ground truth.

For everything else agents do — research, blockchain transactions, content generation, data analysis — there's no keep rate. No ground truth. No way to measure if the work mattered. That's the gap RECEIPT fills.

RECEIPT is the evaluation and measurement layer for agent harnesses. It introduces a new metric: verification rate — what percentage of agent-claimed actions pass independent multi-agent verification. In our test pipeline, agents claimed 100% task completion. Multi-model verification confirmed 73%. The 27% gap is fabrication. RECEIPT catches it, measures it, and proves it on-chain.

How it works — two layers:

Layer 1: Proof of Action. Every agent action — file read, API call, LLM inference, decision — produces a cryptographically signed receipt (Ed25519 signatures, SHA-256 hashes). Each receipt hash-links to the previous one, creating a tamper-evident chain. Like a blockchain of work. Change one receipt in the middle and the entire chain breaks. When Agent B receives work from Agent A, it independently verifies every single receipt before continuing. Signature valid? Hash chain intact? Timestamps in order? One failure = entire handoff rejected.

Layer 2: Proof of Usefulness. A separate AI model — running inside a secure hardware enclave, selected by the system not the agent — scores how useful the chain's output actually was. The agent cannot pick its own grader. The model evaluates alignment (did it do what was asked?), substance (is the content meaningful?), and quality (is it well-executed?). Chains scoring below 60/100 are not anchored on-chain. You don't get credit for bad work, and bad work never becomes training data.

The result is cost per useful output — not just "did the agent run" but "was the output worth paying for." This is the metric that turns agent spending from a black box into a measurable investment.

RECEIPT covers all six layers of the agent harness:
- Orchestration: multi-agent verification pipeline (Researcher produces, Builder verifies)
- Context: each receipt captures inputs, outputs, and the full execution context
- State: immutable signed receipts = state snapshots that cannot be retroactively altered
- Execution: every tool call, API request, and inference captured with cryptographic proof
- Evaluation: independent quality scoring with verification rate as the key metric
- Transport: on-chain anchoring on 0G Mainnet, peer-to-peer handoff via Gensyn AXL

Built on 0G — full stack integration across all three verification pillars:
- Verified Compute: LLM inference (DeepSeek V3, GLM-5) runs inside hardware enclaves with cryptographic attestation via Intel TDX. The hardware proves the computation happened as claimed.
- Verified Identity: each agent gets a soulbound on-chain identity (ERC-7857 NFT) carrying its public key hash. Agents can't impersonate each other.
- Verified Training: quality-gated fine-tuning pipeline. Only chains that pass the usefulness threshold (≥60/100) become training data via 0G's fine-tuning API. Bad work is rejected before it can poison model training.
- Three smart contracts live on 0G Mainnet (chain ID 16661): ReceiptAnchorV2.sol (proof storage), AgentNFT.sol (agent identity), ValidationRegistry.sol (quality attestations via ERC-8004).

Agent-to-agent transport runs through Gensyn AXL — two peer-to-peer nodes relaying receipt chains through an encrypted mesh network. No central server touches the proof at any point in the pipeline.

What we shipped:
- Published SDK on npm: `npm install agenticproof` (47 tests passing) with 3-line middleware integration
- 8-page demo app with real-time streaming, guided walkthrough, adversarial mode, and full evaluation harness
- Verification Rate as hero metric — the "keep rate for agent work beyond code"
- 6 harness layer pills that light up during the demo (Context, Execution, State, Orchestration, Evaluation, Transport)
- Receipt impact visualization showing which actions contributed most to quality score
- Training data qualification card — chains scoring ≥60 become training data, bad work gets rejected
- Constitutional AI evaluation page with multi-model comparison, self-critique effect, consensus accuracy, and dramatic disagreement cards
- Agent Reputation page with leaderboard, degradation tracking sparkline, and cost-per-useful-output analysis
- A2A protocol support (Google's Agent-to-Agent standard) shown during handoff with JSON-RPC envelope
- Adversarial detection: watch RECEIPT catch an agent that fabricates data in real-time
- Client-side chain verification via WebCrypto — no server, no trust required
- Integration adapters for Claude Code (hooks), OpenClaw (plugin), and Cursor (watcher)
- Works with any custom agent harness via the SDK

Every agent harness needs an evaluation layer. Cursor built it for code. RECEIPT is the evaluation layer for everything else.

---

## 4. HOW IT'S MADE

RECEIPT is positioned as the evaluation layer of the agent harness. As agents ship in production (Cursor, Claude Code, OpenClaw), every harness needs an eval layer that proves work quality. Cursor solved this for code with keep rates. RECEIPT solves it for everything else — research, transactions, analysis, content — with cryptographic verification rates.

The core SDK (agenticproof, published on npm) is TypeScript. Each agent action produces a receipt signed with Ed25519 and hashed with SHA-256. Receipts hash-link: each points to the previous receipt's ID, creating a tamper-evident chain. Multi-agent verification happens at handoff — the receiving agent independently checks every receipt's signature, hash chain, and timestamp order before continuing.

0G Integration (full stack):
- Compute: AI inference inside hardware enclaves (TEE) via @0glabs/0g-serving-broker. DeepSeek V3 and GLM-5 endpoints. The enclave proves computation happened as claimed (Intel TDX attestation verified via processResponse()).
- Storage: Receipt chains serialize to Merkle trees and persist on 0G decentralized storage via @0gfoundation/0g-ts-sdk.
- Chain: Three smart contracts on 0G Mainnet (chain ID 16661):
  - ReceiptAnchorV2.sol — anchorRoot(bytes32, bytes32, uint8) stores chain root hash + storage ref + usefulness score permanently
  - AgentNFT.sol (ERC-7857) — soulbound identity tokens carrying Ed25519 public key hash
  - ValidationRegistry.sol (ERC-8004) — usefulness attestations via validationRequest() + validationResponse()
- Training: Quality-gated fine-tuning pipeline. Only chains scoring ≥60/100 become training data via 0G's fine-tuning API. Bad work never becomes training data.

Gensyn AXL provides agent-to-agent transport. Two AXL nodes on a VPS as systemd services with nginx proxy. Receipt chains travel peer-to-peer via AXL's encrypted Yggdrasil mesh — no central server touches the proof.

The demo is Next.js 15 with SSE streaming. Researcher and Builder run as separate API routes streaming events in real-time. The frontend renders receipts as thermal-receipt-style cards with guided walkthrough, adversarial tamper detection with screen shake, and verification rate metrics.

The verify page uses WebCrypto for client-side verification — real Ed25519 signature checking and SHA-256 hash chain validation, no server involvement.

Challenges: Hardware enclave verification required iterating through 4 provider addresses with automatic fallback. The attestation verification call (processResponse()) was undocumented — reverse-engineered from 0G SDK source. AXL nodes needed custom systemd services with nginx reverse proxy for HTTPS.

---

## 5. GITHUB REPO

```
https://github.com/MorkeethHQ/receipt
```

---

## 6. TECH STACK

**ETH Dev Tools:**
- Solidity
- ethers.js v6
- Hardhat (contract compilation)

**Blockchain Networks:**
- 0G Mainnet (chain ID 16661)

**Programming Languages:**
- TypeScript
- Solidity

**Web Frameworks:**
- Next.js 15
- React 19

**Database:**
- 0G Storage (decentralized, Merkle tree)
- 0G KV Store (agent reputation)

---

## 7. HOW WAS AI USED

Claude Code (Anthropic) was the primary implementation partner. Oscar designed the architecture, made all product and integration decisions, and handled deployment. Claude Code implemented the code based on Oscar's direction.

What AI built:
- The SDK: receipt creation, chain management, verification, all crypto primitives
- Smart contracts: ReceiptAnchorV2, AgentNFT, ValidationRegistry
- Demo app: 8-page Next.js app with real-time streaming, guided walkthrough, adversarial mode, eval harness, reputation tracking
- All integrations: 0G Compute/Storage/Chain, Gensyn AXL transport, hardware enclave verification
- Test suite: 47 tests covering agent actions, chain integrity, tamper detection, handoffs

What Oscar designed:
- Architecture: receipt chain concept, hash-linking strategy, multi-agent verification protocol
- Product: the "evaluation layer" framing, verification rate as the key metric, adversarial mode
- Integration strategy: 0G full-stack integration, Gensyn AXL for peer-to-peer transport
- Demo direction: harness layer mapping, keep-rate analogy, cost-per-useful-output metric
- Deployment: contract deployment, Vercel, VPS setup, environment configuration

---

## 8. DEMO VIDEO SCRIPT

See `DEMO-SCRIPT.md` in the repo root for the full beat-by-beat recording script.

Key points:
- ~3 minutes, Oscar on camera + screen
- Opens with `npm install agenticproof` in terminal
- Frames RECEIPT as "keep rate for agent work beyond code"
- Shows honest demo, adversarial mode, client-side verification
- Closes on npm badge

---

## 9. PRE-SUBMISSION CHECKLIST

- [ ] Demo video recorded (~3 min)
- [ ] Logo uploaded (logo-512x512.png)
- [ ] Cover image uploaded (cover-1920x1080.png)
- [ ] 3-5 screenshots captured and uploaded
- [ ] Run demo on production one more time
- [ ] Check 0G wallet balance (need gas for anchor TX)
- [ ] Short description pasted (96 chars)
- [ ] Long description pasted
- [ ] How it's made pasted
- [ ] Tech stack filled in
- [ ] How AI was used pasted
- [ ] GitHub repo linked
- [ ] Submit before May 3, 12pm ET
