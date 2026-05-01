# RECEIPT — Demo Recording Script + Full Submission

## Positioning

RECEIPT is the evaluation and measurement layer of the agent harness.

Cursor built keep rates and satisfaction detection for code. We built cryptographic proof-of-work for everything else — research, transactions, analysis, content. Any agent action that isn't code needs RECEIPT.

**The one-liner metric:** "In our test pipeline, agents claimed 100% task completion. Multi-model verification confirmed 73%. The 27% gap is the lie RECEIPT catches."

**Harness coverage:**

| Harness Layer  | How RECEIPT Covers It |
|----------------|----------------------|
| Orchestration  | Multi-agent verification — the Builder independently checks the Researcher's work |
| Context        | Every receipt captures what the agent was asked, what it saw, what it did |
| State          | Immutable receipt = state snapshot that can't be retroactively changed |
| Execution      | Captures actual tool calls and outputs with signed hashes |
| Evaluation     | The core — was the work useful? Did the output match the intent? |
| Transport      | On-chain anchoring via 0G. Receipts travel with the work, peer-to-peer via Gensyn AXL |

---

## Video Script (~3 minutes)

Oscar on camera + screen. Record at 1920x1080. Chrome, single tab, no extensions visible.

---

### BEAT 1 — The Problem: Agents Don't Have Keep Rates (0:00 – 0:30)

**Show:** Terminal (VS Code or iTerm, dark theme)

**Oscar says:**
> "Cursor built something smart for code agents — keep rates. What percentage of generated code actually survives after an hour, a day, a week? It's the single best signal for whether an agent's work was useful. But code has a unique advantage: you can diff it, compile it, test it. What about everything else agents do? Research, transactions, analysis, content — there's no keep rate for that. No way to measure if the work mattered. RECEIPT is that measurement layer."

**Action:** Type and run:
```bash
npm install agenticproof
```

Show the install completing.

> "This SDK plugs into any agent harness. It captures every action, verifies it cryptographically, and scores whether the output was actually useful — a verification rate. Think of it as keep rate for agent work beyond code."

---

### BEAT 2 — How the Harness Works (0:30 – 0:55)

**Show:** Switch to `receipt-murex.vercel.app`. Scroll slowly through the landing page.

**Oscar says:**
> "Every agent harness has layers — orchestration, context, state, execution, evaluation, transport. RECEIPT covers all six. Every action an agent takes gets a signed receipt. Each receipt links to the previous one — context, state, and execution captured in a chain that breaks if anything is tampered. Then the evaluation layer scores whether the work was actually useful. And the proof gets transported on-chain permanently."

**Action:** Pause on the comparison table.

> "LangSmith and AgentOps cover observability — they tell you what happened. RECEIPT covers evaluation — it tells you whether it mattered. That's the gap in every agent stack today."

---

### BEAT 3 — Run the Demo: Honest Agent (0:55 – 1:55)

**Show:** Click "See It Work" → `/demo` page

**Oscar says:**
> "Two agents. A Researcher gathers information and runs inference. A Builder takes that work, verifies every claim, and scores whether it was useful. This is what the evaluation layer looks like in practice."

**Action:**
1. Show idle state, click **Start Demo**
2. As receipts appear:
   > "Watch the execution layer. File read — receipt. Blockchain query — receipt. AI inference through DeepSeek V3 inside a hardware enclave — receipt. Every action captured with its inputs, outputs, and a cryptographic signature."
3. When handoff happens (packets from R → B):
   > "Transport layer — the chain hands off peer-to-peer through Gensyn's network. No central server touches the proof."
4. As Builder verifies (green checkmarks):
   > "Now the orchestration layer. The Builder doesn't trust the Researcher. It independently verifies every receipt — signature, hash chain, timestamps. This is multi-agent verification."
5. When quality score appears:
   > "And here's the evaluation layer — the core of RECEIPT. A separate model, one the agent can't choose, scores the work on alignment, substance, and quality. 82 out of 100."
6. Show done state — bottom bar with stats:
   > "Here's the metric that matters: verification rate. The agent claimed 10 actions were completed. All 10 verified. Quality score 82. Cost per useful output: fraction of a cent. This is keep rate — but for agent work that isn't code."
7. Point at 0G Verification badges:
   > "Compute verified inside a hardware enclave. Agent identity anchored on-chain. Quality data fed back for training. Three verification layers, all on 0G."
8. Click chain TX link → 0G Mainnet explorer:
   > "And the proof lives permanently on-chain."

**Timing tip:** Speed up the inference wait (~10s) to 2x.

---

### BEAT 4 — The 27% Gap: Adversarial Mode (1:55 – 2:35)

**Show:** Click "Now Try Adversarial" in the bottom bar

**Oscar says:**
> "That was the honest case — 100% verification rate. Now let me show you the gap. In our test pipeline, agents claimed 100% task completion. Multi-model verification confirmed 73%. That 27% gap? That's fabrication. Watch."

**Action:**
1. Researcher produces receipts — receipt #2 gets tampered (red highlight):
   > "The Researcher says it verified data on-chain. It didn't. It assumed the answer and signed a fake receipt."
2. Builder verifies — red FAIL on receipt #2:
   > "The evaluation layer catches it instantly. The hash doesn't match what was signed. You can't argue with math."
3. Screen shake + red flash — REJECTED:
   > "Chain rejected. No quality score. No on-chain anchor. Verification rate: 80%. The agent's keep rate just collapsed — and RECEIPT measured exactly where and why."
4. Pause on contrast:
   > "This is what every agent harness is missing. Not just 'did the agent run' but 'did the work survive verification.' Honest work gets proven. Bad work gets caught. That's evaluation."

---

### BEAT 5 — Verify It Yourself (2:35 – 2:50)

**Show:** Click "Verify This Chain" → `/verify` page

**Oscar says:**
> "You don't have to trust me. Anyone can re-run the evaluation — right here in the browser."

**Action:** Cards flip to green checkmarks:
> "Real signatures, real hashes, checked client-side with WebCrypto. No server. Proof that doesn't require trust."

---

### BEAT 6 — Close (2:50 – 3:00)

**Show:** Back to landing page, ending on npm badge

**Oscar says:**
> "Cursor built keep rates for code. RECEIPT is keep rates for everything else. Verification rate, quality scoring, cryptographic proof — the evaluation layer every agent harness needs. `npm install agenticproof`. Open source, live on 0G Mainnet."

---

## Recording Tips

- **Oscar on camera:** Picture-in-picture or side-by-side with screen. Conversational, not a pitch.
- **Browser:** Chrome, dark system bar, no bookmarks bar, no extensions
- **Resolution:** 1920x1080
- **Zoom:** 90% so the 3-panel layout fits
- **Speed:** Record with OBS/QuickTime. Speed up inference wait (2x), keep rest at 1x
- **Audio:** Record voiceover live while doing the demo. Natural.
- **Length:** Aim for 3 minutes. Hard cap at 4.
- **Key phrase to land:** "Verification rate — keep rate for agent work beyond code."

---

## Submission Form Content

### Short Description (100 chars max)

```
Keep rate for agent work beyond code — cryptographic proof that AI outputs were actually useful.
```

(96 characters)

### Long Description (min 200 words)

```
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
```

### How It's Made

```
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
```

### GitHub Repo

```
https://github.com/MorkeethHQ/receipt
```

### Tech Stack

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

### How Was AI Used

```
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
```

---

## Images Checklist

- [x] Logo 512x512 PNG — `demo/app/public/assets/logo-512.png`
- [x] Cover image 16:9 — `demo/app/public/assets/cover.png` (1920x1080)
- [ ] Screenshot 1: Idle state (mode selector, Start button)
- [ ] Screenshot 2: Running state (receipts appearing, chain building)
- [ ] Screenshot 3: Done state honest (quality score, verified, on-chain TX)
- [ ] Screenshot 4: Done state adversarial (REJECTED, fabrication detected)
- [ ] Screenshot 5: Verify page (green checkmarks, client-side verification)

**How to capture:** Run demo in Chrome at 1920x1080, Cmd+Shift+4 to capture regions.

---

## Pre-Submission Checklist

- [ ] Demo video recorded (~3 min)
- [ ] Logo uploaded
- [ ] Cover image uploaded
- [ ] 3-5 screenshots captured and uploaded
- [ ] Run demo on production one more time to confirm everything works
- [ ] Check 0G wallet balance (need gas for anchor TX during judge evaluation)
- [ ] Submit before May 3, 12pm ET
