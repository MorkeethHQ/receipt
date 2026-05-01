# RECEIPT Demo Recording Script + Submission Guide

## Video Script (2-4 minutes)

Target: **3 minutes**. Record screen at 1920x1080. Use browser at ~90% zoom so everything fits.

---

### BEAT 1 — The Problem (0:00 - 0:20)

**Show:** Landing page `receipt-murex.vercel.app`

**Say (voiceover or text overlay):**
> "AI agents are black boxes. When one agent hands work to another, there's no way to verify what it actually did. Did it read the right file? Call the right API? And even if it did — was the output worth paying for?"

**Action:** Scroll slowly past the tagline "Proof that AI work actually mattered" and the comparison table showing RECEIPT vs LangSmith/AgentOps/etc. Pause on the row where RECEIPT has all checkmarks.

---

### BEAT 2 — Honest Mode (0:20 - 1:30)

**Show:** Click "See It Work" → `/demo` page

**Action sequence:**
1. Show idle state — "Honest Agent" is selected, Start button is pulsing
2. Point out the transport status dots (P2P if green, HTTP if gray)
3. Click **Start Demo**
4. **Researcher phase** — narrate as receipts appear:
   > "The Researcher reads a file, calls the 0G Mainnet contract API, runs inference through a TEE enclave via DeepSeek V3. Every action gets a cryptographic receipt — signed with Ed25519, hash-linked with SHA-256."
5. **Chapter 1 pause** — click Continue (or let it auto-play if guided mode off)
6. **Handoff** — watch the animation showing packets from R to B:
   > "The chain hands off to the Builder — peer-to-peer via Gensyn AXL. No central server touches it."
7. **Builder verification** — watch PASS badges appear in center panel:
   > "The Builder independently verifies every single receipt. Signature, hash chain, timestamp order."
8. **Review + Quality gate** — watch the usefulness score animate:
   > "Then a different model, running inside a hardware enclave, scores the chain's actual usefulness. The agent can't pick its own grader."
9. **Done state** — pause on the bottom bar showing: receipts count, trust score, verified count, quality score, time, tokens, $/useful
   > "10 receipts. All verified. Quality 82/100. Cost per useful output: fraction of a cent."
10. Show the **0G Verification** card in center panel: Compute ✓, Identity ✓, Training ✓
11. Show the **on-chain TX links** — click one to open 0G Mainnet explorer

**Timing tip:** Don't wait for the full pipeline if it's slow. Speed up the video 2x during the inference wait (~10s), then slow back to 1x when receipts start appearing.

---

### BEAT 3 — Adversarial Mode (1:30 - 2:15)

**Action:** Click "Now Try Adversarial" button in bottom bar (auto-starts)

**Say:**
> "Now watch what happens when an agent lies."

**Action sequence:**
1. Watch Researcher receipts appear — receipt #2 gets tampered (red strikethrough on output hash)
2. Handoff happens
3. Builder starts verifying — receipt #2 shows **FAIL** in red
4. **Screen shake + red flash** — FABRICATION DETECTED
5. Builder panel shows big red X with "Handoff Rejected"
6. Center panel shows "REJECTED" stamp

**Say:**
> "The Researcher said it verified the contract on-chain. It didn't. It assumed the data. The hash doesn't match what was signed. The Builder catches the lie and rejects the entire chain. Zero trust, zero damage."

**Pause on the bottom bar** showing the contrast: no quality score, no anchor, chain rejected.

---

### BEAT 4 — Verify It Yourself (2:15 - 2:40)

**Action:** Go back to honest mode result (or use a previous run). Click **"Verify This Chain"** button.

**Show:** `/verify` page auto-verifying the chain
1. Cards flip from "checking" to green checkmarks one by one
2. Show the 3 individual checks per receipt: sig ✓, hash ✓, time ✓
3. Point out "Client-side verification — WebCrypto, no server involved"

**Say:**
> "Anyone can verify this chain. Client-side, in the browser. Real Ed25519 signatures, real SHA-256 hashes. No server, no trust required."

---

### BEAT 5 — The Stack (2:40 - 3:00)

**Show:** Quick scroll through landing page "Built on" section showing:
- 0G Verified Compute (TEE)
- 0G Verified Identity (ERC-7857)
- 0G Verified Training (quality-gated)
- Gensyn AXL Transport
- 3 contract addresses on 0G Mainnet

**Say:**
> "Two-layer proof for agent work. Layer 1: every action is cryptographically proven. Layer 2: the output is scored for usefulness inside a hardware enclave. Bad work never reaches the blockchain, never becomes training data. RECEIPT — proof that AI work actually mattered."

**End on the `npm install agenticproof` badge.**

---

## Recording Tips

- **Browser:** Chrome, dark system bar, no bookmarks bar, no extensions visible
- **Resolution:** 1920x1080 or 2560x1440
- **Zoom:** Browser at 90% so the 3-panel layout fits
- **Tab:** Single tab, no other tabs visible
- **Speed:** Use OBS or QuickTime. Speed up the 10s inference wait to 2x, keep everything else 1x
- **Audio:** If voiceover, record separately and overlay. If text overlays, use a tool like Kapwing
- **Length:** Hard cap at 4 minutes. Aim for 3.

---

## Submission Form Content

### Short Description (100 chars max)

```
Two-layer proof for AI agent work: cryptographic receipts + TEE-attested quality scoring on 0G
```

(94 characters)

### Long Description

```
RECEIPT is a two-layer proof system for AI agent work.

Layer 1 — Proof of Action. Every agent action (file read, API call, LLM inference, decision) produces a cryptographically signed receipt (Ed25519 + SHA-256). Receipts hash-link into a tamper-evident chain. When the Builder receives work from the Researcher, it independently verifies every receipt before continuing. One tampered receipt = entire chain rejected.

Layer 2 — Proof of Usefulness. A TEE-attested model (selected inside the enclave, not by the agent) scores the chain on alignment, substance, and quality. The agent can't pick its own grader. Chains scoring below 60/100 are NOT anchored on-chain — you don't get credit for bad work.

The result: cost-per-useful-output. Not just "did the agent run" but "was the output worth paying for."

Key features:
- 10 receipts per pipeline run (5 researcher + 4 builder + 1 review), all signed and hash-linked
- Real 0G Compute inference (DeepSeek V3) with TEE attestation (Intel TDX)
- On-chain anchoring on 0G Mainnet with usefulness scores
- ERC-7857 soulbound agent identity NFTs
- ERC-8004 validation registry attestations
- Agent-to-agent handoff via Gensyn AXL P2P
- Published SDK: npm install agenticproof (47 tests)
- Works with Claude Code (hooks), OpenClaw (plugin), Cursor (watcher), or any custom agent
- Adversarial mode: watch RECEIPT catch an agent that fabricates data
- Independent chain verification via WebCrypto (client-side, no server)
```

### How It's Made

```
The core SDK (agenticproof, published on npm) is written in TypeScript. It provides ReceiptAgent for creating agents, recording actions, and producing signed receipts. Each receipt is signed with Ed25519 (@noble/ed25519) and hashed with SHA-256 (@noble/hashes). Receipts hash-link: each receipt's prevId points to the previous receipt's id, creating a tamper-evident chain.

0G Integration (full stack):
- Compute: TEE-attested LLM inference via @0glabs/0g-serving-broker. We use createZGComputeNetworkBroker to get service metadata, generate auth headers, and call DeepSeek V3 / GLM-5 endpoints. TEE verification via processResponse() confirms Intel TDX attestation.
- Storage: Merkle tree persistence via @0gfoundation/0g-ts-sdk. Receipt chains serialize to bytes, get Merkle-treed, and upload to 0G storage nodes.
- Chain: ReceiptAnchorV2.sol deployed on 0G Mainnet (chain ID 16661). anchorRoot(bytes32, bytes32, uint8) stores chain root hash + storage reference + usefulness score permanently.
- Agentic ID: AgentNFT.sol (ERC-7857) mints soulbound identity tokens. Each token carries the agent's Ed25519 public key hash and chain root as iDatas.
- Validation: ValidationRegistry.sol (ERC-8004) posts usefulness attestations on-chain via validationRequest() + validationResponse().
- Fine-Tuning: Quality-gated pipeline. Only chains scoring ≥60/100 become training data via 0G's fine-tuning API.

Gensyn AXL provides the agent-to-agent transport layer. Two AXL nodes deployed on a VPS as systemd services with nginx proxy. The Researcher sends its receipt chain peer-to-peer via AXL's encrypted Yggdrasil mesh — no central server touches the proof.

The demo app is Next.js 15 with SSE streaming. The researcher and builder each run as separate API routes that stream events in real-time. The frontend renders receipts as they arrive with thermal-receipt-style cards, guided walkthrough with chapter pauses, and adversarial tamper detection with screen shake effects.

The verify page uses WebCrypto for client-side verification — real Ed25519 signature checking and SHA-256 hash chain validation, no server involvement.

Smart contracts are written in Solidity, deployed on 0G Mainnet via ethers.js v6.

Challenges: Getting 0G Compute TEE attestation working required iterating through 4 provider addresses with automatic fallback. The broker's processResponse() call for TEE verification was undocumented — we reverse-engineered it from the SDK source. AXL node deployment required custom systemd services with nginx reverse proxy for HTTPS.
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
Claude Code (Anthropic) was the primary implementation partner. Oscar designed the architecture, made product decisions, chose the integration strategy, and handled deployment. Claude Code implemented the SDK, smart contracts, demo app, API routes, and integrations based on Oscar's direction.

Specific AI contributions:
- SDK implementation: ReceiptAgent, ReceiptChain, verifyChain(), all crypto primitives
- Smart contract development: ReceiptAnchorV2.sol, AgentNFT.sol, ValidationRegistry.sol
- Demo app: 6-page Next.js app with SSE streaming, guided walkthrough, adversarial detection
- 0G integration: Compute broker setup, TEE verification, storage upload, chain anchoring, fine-tuning pipeline, agentic ID minting, ERC-8004 validation
- Gensyn AXL integration: AxlTransport SDK class, VPS node deployment scripts
- Test suite: 47 tests covering all agent actions, chain integrity, tamper detection, handoffs

Human contributions (Oscar):
- Architecture: the receipt chain mechanic, hash-linking strategy, multi-agent handoff protocol
- Product: what to build, what to skip, scope management
- Integration strategy: 0G full-stack integration design, Gensyn AXL for P2P transport
- Demo direction: adversarial mode, quality gate visualization, cost-per-useful-output metric
- Deployment: contract deployment, Vercel configuration, VPS setup, environment management
```

---

## Images Needed

### 1. Logo (512x512 PNG)

**Design brief:** Minimal, monochrome. A stylized receipt/paper icon with a chain link or checkmark. Use the thermal receipt aesthetic — dotted borders, monospace text. Background: `#f5f3ef` (the app's bg color). Text: `#1a1a1a`.

**Quick option:** Screenshot the R.E.C.E.I.P.T. text from the landing page hero, crop to square, add padding. Or use a tool like Figma/Canva to create a simple receipt icon.

### 2. Cover Image (16:9, recommended 1920x1080)

**Design brief:** Screenshot of the demo page in the "done" state showing:
- Left panel: Researcher receipts with chain links
- Center panel: CHAIN STATUS with 0G Verification card (all 3 checkmarks)
- Right panel: Builder receipts
- Bottom bar: stats (receipts, trust, verified, quality, time, tokens, $/useful)

**How to get it:** Run the honest demo, wait for completion, take a full-page screenshot at 1920x1080.

### 3. Screenshots (3-5 recommended)

1. **Idle state** — Mode selector with "Honest Agent" / "Catch the Lie" buttons, Start button pulsing
2. **Running state** — Mid-pipeline with receipts appearing, chain integrity meter, stage indicators
3. **Done state (honest)** — Full results: quality score, 0G verification card, on-chain TX links
4. **Done state (adversarial)** — Red REJECTED stamp, fabrication detected, handoff refused
5. **Verify page** — Chain being verified with green checkmarks, individual sig/hash/time badges

**How to get them:** Run the demo in Chrome at 1920x1080, use Cmd+Shift+4 (Mac) to capture regions, or use Chrome DevTools device toolbar for consistent sizing.

---

## Checklist Before Submission

- [ ] Demo video recorded (2-4 min)
- [ ] Logo 512x512 created
- [ ] Cover image 16:9 captured
- [ ] 3-5 screenshots captured
- [ ] Run demo on production one more time to confirm everything works
- [ ] Check 0G wallet balance (need gas for anchor TX during judge evaluation)
- [ ] Submit before May 3, 12pm ET
