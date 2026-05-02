# RECEIPT -- Submission + Demo Guide

Everything for the ETHGlobal Open Agents submission in one file. Scroll through, copy-paste what you need.

---

## IMAGES

| File | What | Size |
|------|------|------|
| `submission/logo-512x512.png` | Logo/avatar | 512x512 |
| `submission/cover-1920x1080.png` | Cover image (16:9) | 1920x1080 |

Screenshots to capture from production (`receipt-murex.vercel.app/demo`, Chrome 1920x1080, Cmd+Shift+4):
1. Idle state (mode selector, Start button)
2. Running state (receipts appearing, chain building)
3. Done state honest (quality score, 0G verification, TX links)
4. Done state adversarial (REJECTED stamp, red)
5. Verify page (green checkmarks, client-side verification)

---

## SHORT DESCRIPTION (100 chars max)

```
The evaluation layer for AI agents -- cryptographic proof that agent outputs were actually useful.
```
98 characters.

---

## LONG DESCRIPTION (min 200 words)

```
The problem with AI agents today isn't capability -- it's trust. Claude Code, Cursor, OpenClaw, Hermes -- agents are shipping everywhere. But when you deploy an agent to do research, execute transactions, analyze data, or generate content, you're taking the agent's word for it. Did it actually read the right file, or did it hallucinate the contents? Did it call the real API, or skip the call and fabricate a response? And even if it did the work honestly -- was the output worth what you paid?

There's no standard way to measure whether agent work was useful. No verification layer that works across tools. No metric that tells you which agents earned their keep and which ones burned tokens for nothing. That's the gap RECEIPT fills.

RECEIPT is the evaluation and measurement layer for agent harnesses. It introduces a new metric: verification rate -- what percentage of agent-claimed actions pass independent multi-agent verification. When the Builder receives work from the Researcher, it independently checks every receipt. The verification rate tells you how much of the claimed work actually survived scrutiny. RECEIPT catches fabrication, measures quality, and proves both on-chain.

How it works -- two layers:

Layer 1: Proof of Action. Every agent action -- file read, API call, LLM inference, decision -- produces a cryptographically signed receipt (Ed25519 signatures, SHA-256 hashes). Each receipt hash-links to the previous one, creating a tamper-evident chain. Like a blockchain of work. Change one receipt in the middle and the entire chain breaks. When the Builder receives work from the Researcher, it independently verifies every single receipt before continuing. Signature valid? Hash chain intact? Timestamps in order? One failure = entire handoff rejected.

Layer 2: Proof of Usefulness. A separate AI model -- running inside a secure hardware enclave, selected by the system not the agent -- scores how useful the chain's output actually was. The agent cannot pick its own grader. The model evaluates alignment (did it do what was asked?), substance (is the content meaningful?), and quality (is it well-executed?). Chains scoring below 60/100 are not anchored on-chain. You don't get credit for bad work, and bad work never becomes training data.

The result is cost per useful output -- not just "did the agent run" but "was the output worth paying for." This is the metric that turns agent spending from a black box into a measurable investment.

RECEIPT covers all six layers of the agent harness:
- Orchestration: multi-agent verification pipeline (Researcher produces, Builder verifies)
- Context: each receipt captures inputs, outputs, and the full execution context
- State: immutable signed receipts = state snapshots that cannot be retroactively altered
- Execution: every tool call, API request, and inference captured with cryptographic proof
- Evaluation: independent quality scoring with verification rate as the key metric
- Transport: on-chain anchoring on 0G Mainnet, peer-to-peer handoff via Gensyn AXL

Built on 0G -- full stack integration across all three verification pillars:
- Verified Compute: LLM inference (DeepSeek V3, GLM-5) runs inside hardware enclaves with cryptographic attestation via Intel TDX. The hardware proves the computation happened as claimed.
- Verified Identity: each agent gets an on-chain identity token (ERC-7857 NFT) carrying its public key hash. Agents can't impersonate each other.
- Verified Training: quality-gated data pipeline. Only chains that pass the usefulness threshold (>=60/100) produce training-eligible data. Bad work is rejected before it can poison model training.
- Four smart contracts live on 0G Mainnet (chain ID 16661): ReceiptAnchorV2.sol (proof storage), AgentNFT.sol (agent identity), ValidationRegistry.sol (quality attestations via ERC-8004), ReceiptRegistry.sol (on-chain chain coordination per wallet address).

Agent-to-agent transport runs through Gensyn AXL -- two peer-to-peer nodes relaying receipt chains through an encrypted mesh network. No central server touches the proof at any point in the pipeline.

What we shipped:
- Published SDK on npm: `npm install agenticproof` (47 tests passing)
- Dashboard with wallet connect: register chains on-chain via MetaMask, no database
- Four smart contracts deployed on 0G Mainnet: ReceiptAnchorV2 (proof storage), AgentNFT (ERC-7857 identity), ValidationRegistry (ERC-8004 attestations), ReceiptRegistry (on-chain chain coordination per wallet)
- Live demo with guided walkthrough: two agents produce, verify, and score a receipt chain in real-time
- Adversarial mode: RECEIPT catches a lying agent with real tamper detection
- TEE-attested LLM inference via 0G Compute (DeepSeek V3 for research, GLM-5 for quality review)
- Client-side chain verification via WebCrypto (Ed25519 + SHA-256) -- no server, no trust required
- Agent-to-agent handoff via Gensyn AXL (P2P when nodes available, direct HTTP fallback)

Every agent harness needs an evaluation layer. RECEIPT is that layer -- agent-agnostic, cryptographically verifiable, anchored on-chain.
```

---

## HOW IT'S MADE

```
RECEIPT is the evaluation layer for agent harnesses. As agents ship in production across Claude Code, Cursor, OpenClaw, and Hermes, every harness needs an eval layer that proves work quality. RECEIPT is agent-agnostic -- it plugs into any tool via a single SDK and measures whether agent work was actually useful, with cryptographic verification rates.

The core SDK (agenticproof, published on npm) is TypeScript. Each agent action produces a receipt signed with Ed25519 and hashed with SHA-256. Receipts hash-link: each points to the previous receipt's ID, creating a tamper-evident chain. Multi-agent verification happens at handoff -- the receiving agent independently checks every receipt's signature, hash chain, and timestamp order before continuing.

0G Integration (full stack):
- Compute: AI inference inside hardware enclaves (TEE) via @0glabs/0g-serving-broker. DeepSeek V3 and GLM-5 endpoints. The enclave proves computation happened as claimed (Intel TDX attestation verified via processResponse()).
- Storage: Receipt chain data structured for 0G decentralized storage via @0gfoundation/0g-ts-sdk.
- Chain: Four smart contracts on 0G Mainnet (chain ID 16661):
  - ReceiptAnchorV2.sol -- anchorRoot(bytes32, bytes32, uint8) stores chain root hash + storage ref + usefulness score permanently
  - AgentNFT.sol (ERC-7857) -- agent identity tokens carrying Ed25519 public key hash
  - ValidationRegistry.sol (ERC-8004) -- usefulness attestations via validationRequest() + validationResponse()
  - ReceiptRegistry.sol -- on-chain coordination layer mapping wallet addresses to their registered receipt chains. Dashboard reads directly from this contract via MetaMask.
- Training: Quality-gated data pipeline. Only chains scoring >=60/100 produce training-eligible data. Bad work is rejected before it enters any pipeline.

Gensyn AXL provides agent-to-agent transport. Receipt chains travel via AXL nodes with P2P capability and direct HTTP fallback.

The demo is Next.js 15 with SSE streaming. Researcher and Builder run as separate API routes streaming receipts in real-time. A guided walkthrough (5 chapters) walks through the flow: Researcher signs receipts, chain hands off via Gensyn AXL P2P, Builder verifies every receipt, TEE-attested model scores usefulness, and the proof anchors on 0G Mainnet. The done state shows VERIFIED BY 0G badges, clickable ANCHOR TX and ERC-7857 NFT links to chainscan.0g.ai. Adversarial mode shows RECEIPT catching a lying agent with real tamper detection.

The verify page uses WebCrypto for client-side verification -- real Ed25519 signature checking and SHA-256 hash chain validation, no server involvement.

Challenges: Hardware enclave verification required iterating through 4 provider addresses with automatic fallback. The attestation verification call (processResponse()) was undocumented -- reverse-engineered from 0G SDK source. AXL nodes needed custom systemd services with nginx reverse proxy for HTTPS.
```

---

## GITHUB REPO

```
https://github.com/MorkeethHQ/receipt
```

---

## TECH STACK

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

## HOW WAS AI USED

```
Claude Code (Anthropic) was the primary implementation partner. Oscar designed the architecture, made all product and integration decisions, and handled deployment. Claude Code implemented the code based on Oscar's direction.

What AI built:
- The SDK: receipt creation, chain management, verification, all crypto primitives
- Smart contracts: ReceiptAnchorV2, AgentNFT, ValidationRegistry, ReceiptRegistry
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

## DEMO VOICEOVER SCRIPT (~3 min)

Voiceover recorded separately over screen recording. Conversational, not a pitch.

### BEAT 1 -- Hook (0:00-0:08)

**Screen:** Landing page hero at `receipt-murex.vercel.app`
**Action:** Page is already loaded. Hold for 2 seconds, then scroll down slowly past "Did your AI agent actually do the work?" headline.

> "AI agents say they did the work. But did they? RECEIPT is the proof layer. Let me show you."

### BEAT 2 -- SDK install flash (0:08-0:22)

**Screen:** Terminal (dark background, large font)
**Action:** Three quick terminal cuts, 4 seconds each. Type or paste each command.

Terminal 1 (Claude Code):
```
npx receipt init --claude-code
```

> "One command for Claude Code."

Terminal 2 (OpenClaw):
```
openclaw plugins install openclaw-plugin-receipt
```

> "One command for OpenClaw."

Terminal 3 (Cursor):
```
npx receipt init --cursor
```

> "One command for Cursor. Every tool call, every file edit, every inference becomes a signed receipt. Chains publish to the dashboard automatically."

### BEAT 3 -- Dashboard + wallet connect (0:22-0:45)

**Screen:** Navigate to `receipt-murex.vercel.app/team` (Dashboard)
**Action:** Show the empty state with the step-by-step guide (1. Run Demo, 2. Chain appears, 3. Register On-Chain). Then click "Connect Wallet". MetaMask pops up. Approve.

> "This is your dashboard. Connect your wallet. See the steps: run a demo, chain appears, register it on 0G Mainnet. No database, no server. Four smart contracts, one on-chain registry."

After wallet connects, show the green 0G Mainnet badge and wallet address.

> "Connected. Let me generate a chain."

### BEAT 4 -- Live demo, honest flow (0:45-2:05)

**Screen:** Navigate to `receipt-murex.vercel.app/demo`
**Action:** Make sure HONEST mode is selected (green). Click "Start Demo". Full screen. Receipts appear one by one in left panel.

As receipt #1 (file_read) appears:
> "First action. The Researcher reads a file. The contents are hashed into a signed receipt. If it later claims it read something different, the hash won't match."

As receipt #2 (api_call) appears:
> "Now it queries the 0G Mainnet smart contract. The exact API response is locked into the receipt."

As receipt #3 (llm_call) appears (this is the slow one, 8-10 seconds):
> "This is the big one. LLM inference running inside a hardware enclave. Intel TDX. The model, the prompt, the response... all cryptographically signed by the hardware itself. Not even the agent operator can swap the output. This is 0G Verified Compute."

As receipts #4-#5 appear:
> "Decision. Output. Five signed receipts in a hash-linked chain. Time to hand it off."

As handoff animation plays (center panel):
> "The chain travels peer-to-peer through Gensyn AXL. No central server touches the proof."

As Builder receipts appear (#6-#9) + green checkmarks:
> "The Builder doesn't trust any of it. It checks every signature, every hash link. Green means the receipt survived independent verification."

As receipt #10 (usefulness_review) appears:
> "Now a separate model, selected by the system not the agent, scores how useful the work actually was. The agent can't pick its own grader."

Done state (CHAIN VERIFIED, 0G badges, quality bars):
> "All receipts verified. Quality passed the gate. Chain anchored on 0G Mainnet."

### BEAT 5 -- Register on-chain via MetaMask (2:05-2:25)

**Screen:** Click "View in Dashboard" or navigate to `/team`
**Action:** The chain now appears in the list. Click "Register On-Chain" button (blue). MetaMask popup appears.

> "There's the chain on the dashboard. Click Register On-Chain."

Sign the transaction in MetaMask. Wait for confirmation (a few seconds).

> "You're writing to the ReceiptRegistry contract. Wallet address, root hash, quality score. Permanent. On 0G Mainnet."

After confirmation, ON-CHAIN badge appears in green.

> "ON-CHAIN. Click through to the explorer. Four contracts, zero databases."

### BEAT 6 -- Adversarial mode (2:25-2:45)

**Screen:** Navigate to `/demo`. Click "Catch the Lie" mode (red button). Click Start.
**Action:** Let it run. Receipt #2 will appear RED with MISMATCH. Screen will flash red.

> "That was honest work. Now watch what happens when an agent lies."

Pause on the red receipt and MISMATCH badge:
> "Receipt two. The hash doesn't match. The agent fabricated the API response after signing."

Builder catches it, REJECTED stamp appears:
> "Builder catches it. Handoff rejected. No quality score, no on-chain anchor. Zero trust, zero damage."

### BEAT 7 -- Verify + close (2:45-3:00)

**Screen:** Navigate to `/verify`. Click "Honest chain" to load a chain. Click "Verify Chain". Green checkmarks appear one by one.
**Action:** Let verification animation play. All cards go green.

> "You don't have to trust the demo. Client-side verification. Real Ed25519 signatures, real SHA-256 hash chains. Your browser, no server."

**Screen:** Quick cut back to landing page.

> "RECEIPT. The evaluation layer for AI agents. npm install agenticproof. Four contracts live on 0G Mainnet."

---

## RECORDING GUIDE

### Setup before recording

1. Open Chrome at 1920x1080 (or similar 16:9)
2. Open `receipt-murex.vercel.app` in one tab
3. Open a terminal in another tab/window (for Beat 2)
4. Have MetaMask ready with 0G Mainnet (chain 16661) and some A0GI for gas
5. Clear any previous demo chains: open dashboard, make sure it's clean
6. Test the demo flow once before recording to make sure TEE inference is working

### Screen-by-screen timing

| Beat | Screen | Duration | URL |
|------|--------|----------|-----|
| 1 | Landing page hero | 8s | `/` |
| 2 | Terminal (3 quick cuts) | 14s | Terminal app |
| 3 | Dashboard empty + wallet connect | 23s | `/team` |
| 4 | Demo honest flow (full run) | 80s | `/demo` |
| 5 | Dashboard + Register On-Chain | 20s | `/team` |
| 6 | Demo adversarial flow | 20s | `/demo` |
| 7 | Verify page + landing close | 15s | `/verify` then `/` |
| **Total** | | **~3:00** | |

### Recording tips

- Record screen first, do voiceover second (easier to time)
- Do NOT speed up the demo receipts. The wait time is when you talk.
- The MetaMask signing moment is key. Judges need to see a real on-chain TX.
- The adversarial MISMATCH and red flash are the money shots. Pause on them.
- Don't read exact numbers from screen (they change each run). Say "quality passed the gate" not "82 out of 100"
- Key phrases to land:
  - "The evaluation layer for AI agents"
  - "No database. No server. Just proof."
  - "The agent can't pick its own grader"
  - "Zero trust, zero damage"

---

## PRE-SUBMISSION CHECKLIST

- [ ] Demo video recorded (~3 min, voiceover over screen capture)
- [ ] Logo uploaded (submission/logo-512x512.png)
- [ ] Cover image uploaded (submission/cover-1920x1080.png)
- [ ] 3-5 screenshots captured from production
- [ ] Run demo on production one final time before submitting
- [ ] Check 0G wallet has gas for the on-chain registration TX
- [ ] Short description pasted (98 chars)
- [ ] Long description pasted
- [ ] How it's made pasted
- [ ] Tech stack filled in
- [ ] How AI was used pasted
- [ ] GitHub repo linked
- [ ] Submit before May 3, 12pm ET
