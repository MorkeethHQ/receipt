# RECEIPT — Final Build Prompt

**Context:** ETHGlobal Open Agents hackathon. Submission deadline May 3, 12pm ET. 3 days to build. Oscar is the PM and architect, you are the implementation partner. Ship the best possible product.

**Positioning:** RECEIPT is the evaluation layer of the agent harness. Cursor built keep rates for code — measuring what percentage of agent-generated code survives. We built verification rates for everything else. Every agent action gets a cryptographic receipt. Every chain gets scored for usefulness. Bad work gets caught. Good work gets proven on-chain.

**Key metric:** Verification Rate = % of agent actions that survived independent verification + quality scoring. This is keep rate for agent work beyond code.

**Current state:** Strong foundation — real crypto (ed25519 + SHA-256), 3 deployed smart contracts on 0G Mainnet, TEE-attested inference, multi-agent demo (Researcher → Builder), constitutional AI eval with self-critique, P2P transport via Gensyn AXL, published SDK (agenticproof@0.1.1, 47 tests). 6 demo pages: landing, live demo, trial (execution replay), team feed, verify (client-side), eval (constitutional AI).

**What the prompt below describes is what takes it from 8/10 to 10/10.**

---

## TIER 1 — Ship these first (highest judge impact)

### 1.1 Verification Rate: Name it, own it, hero it

The demo already computes `verificationsPassedCount / totalReceiptsGenerated` but buries it in a small progress bar. This IS the keep rate for agent work. Make it impossible to miss.

**Demo page (`demo/app/app/demo/page.tsx`):**
- In the done-state stats bar (around line 1730-1840), make Verification Rate the FIRST and LARGEST metric. Show it as a percentage: `100%` (honest, green, large font) or `80%` (adversarial, red). Current stats bar shows: Receipts | Trust | Verified (as X/Y) | Quality | Time | Tokens | $/useful. Reorder to: **Verification Rate** (new, hero-sized) | Quality | Time | Tokens | $/useful. Drop "Trust" and "Verified X/Y" — they're redundant now that Verification Rate combines them.
- In the bottom narrative bar (around line 2130), change "X/Y verified" label to show "Verification Rate: X%"
- In adversarial done state: show the rate dropping with a visual comparison. "Honest: 100% → Adversarial: 80%. The 20% gap is fabrication."

**Trial page (`demo/app/app/trial/page.tsx`):**
- Add Verification Rate as a 4th StatCard in the grid (line ~398). Currently shows: total time, tokens, quality. Add: Verification Rate.
- In comparison mode: show verification rate delta between honest and low-quality runs.

**Landing page (`demo/app/app/page.tsx`):**
- In the hero section, add a live stat: "Avg Verification Rate: X%" pulled from saved demo chains.
- In the "how it works" section, make verification rate the key output, not just "anchored on-chain."

**Submission text (`SUBMISSION.md`, `DEMO-SCRIPT.md`):**
- Replace every instance of "verification" with "verification rate" where it refers to the metric.
- The one-liner should land on: "Verification rate — keep rate for agent work beyond code."

---

### 1.2 Harness Layer Visualization — See the framework during the demo

The demo has a story stage indicator (Researcher → Handoff → Verification → Builder → Record) but doesn't show which harness layer is being exercised. Judges need to SEE the 6-layer framework in action, not just read about it on the landing page.

**Demo page (`demo/app/app/demo/page.tsx`):**
- Add a harness layer strip below the story stage indicator (around line 2145-2170).
- 6 small pills in a row: `Orchestration | Context | State | Execution | Evaluation | Transport`
- Default state: all dim/gray.
- As each receipt arrives, light up the relevant layers with a subtle pulse animation:
  - `file_read`, `api_call` → **Context** (capturing what the agent saw) + **Execution** (tool call)
  - `llm_call` with TEE attestation → **Execution** (inference) + **State** (TEE = immutable state snapshot)
  - `decision` → **Context** (reasoning captured) + **State** (decision is permanent)
  - AXL handoff → **Transport** (P2P delivery)
  - Builder verification (green checks) → **Orchestration** (multi-agent verification)
  - `usefulness_review` → **Evaluation** (the core — was the work useful?)
  - On-chain anchor → **Transport** (permanent storage) + **State** (immutable on-chain record)
- At done state: show "6/6 harness layers exercised" with all pills green.
- Color scheme: use a single accent color per layer (blue for orchestration, purple for context, green for state, amber for execution, red for evaluation, cyan for transport) — or keep it simpler with just highlighted vs dim.

This is the visual bridge between the pitch ("evaluation layer of the agent harness") and what judges actually see.

---

### 1.3 Eval Page Results UI — Show the constitutional AI, don't dump JSON

The eval page (`demo/app/app/eval/page.tsx`) runs 60 test cases across 3 models with constitutional AI self-critique, but results display is minimal. This is one of the most impressive features and it's hidden behind raw numbers.

**After eval completes, show these cards:**

**Model Comparison Card:**
- 3 columns (DeepSeek V3, GLM-5, Claude), each showing:
  - Pre-critique accuracy: X%
  - Post-critique accuracy: Y%
  - Improvement: +Z%
  - Category breakdown: useful / mediocre / adversarial accuracy
- Highlight the best-performing model.

**Critique Effect Card:**
- "Self-critique improved accuracy by X% on average"
- Show: % of scores that changed, % that improved, % that worsened, avg delta in points
- List the 5 constitutional principles with how many times each triggered a change:
  1. "Am I being fooled by length or verbosity?" — triggered N times
  2. "Does this work contain actionable insight?" — triggered N times
  3. etc.
- This data is already computed in `buildReport()` — it just needs UI.

**Consensus Card:**
- Agreement rate: X% of test cases where all 3 models agreed
- Consensus accuracy: Y% (majority vote vs ground truth)
- "When models disagree, the consensus was right Z% of the time"

**Top Disagreements Card:**
- Show the 3-5 most interesting disagreements (>20pt spread)
- For each: show the test case snippet, each model's score, and which model was right
- This is dramatic and judges will love it — "Model A thought this was 85/100 useful, Model B scored it 40. Who was right?"

**False Positive/Negative Summary:**
- "X false positives: useless work rated as useful"
- "Y false negatives: useful work rated as useless"
- Show the worst offenders

The eval already computes all of this data (lines 310-433 in the route). The frontend just needs to render it properly instead of as a raw JSON dump.

---

## TIER 2 — Ship these next (depth + polish)

### 2.1 Agent Reputation Page — New page: `/reputation`

The `writeReputation()` function and `/api/reputation` route already exist. Agent scores are being written to 0G KV Store. But there's no UI to see reputation data. This closes the loop.

**New page: `demo/app/app/reputation/page.tsx`**

Show:
- **Agent Leaderboard:** Pull agent scores from KV store (or aggregate from saved chains). Show: agentId, total runs, avg verification rate, avg quality score, total receipts.
- **Agent Detail:** Click an agent → see all their chains, quality scores over time, which actions they do best/worst at.
- **Reputation Score Formula:** Show how it's computed — weighted avg of verification rate + quality score across runs.
- **On-chain proof:** Link each score to the 0G KV store entry and the ValidationRegistry attestation.

**New API route: `demo/app/app/api/reputation-feed/route.ts`**
- Aggregate reputation data from:
  1. Saved demo chains (`~/.receipt/demo-chains/`)
  2. OpenClaw chains (VPS)
  3. On-chain ValidationRegistry events (read `getAgentValidations()`)
- Return: `{ agents: [{ agentId, runs, avgVerificationRate, avgQuality, totalReceipts, lastSeen }] }`

This shows judges the flywheel: agents build reputation over time, verified on-chain.

---

### 2.2 Degradation Tracking — Verification rate over time

Cursor tracks keep rate dropping as a signal something is wrong. RECEIPT should show the same.

**Where:** Either on the new `/reputation` page or on `/team`.

**What to build:**
- Pull all saved demo chains from `/api/chains`.
- For each chain: compute verification rate + quality score + timestamp.
- Show a simple sparkline/trend: verification rate over the last N runs.
- Color code: green if stable/improving, amber if declining >5%, red if sharp drop >15%.
- "Last 10 runs: avg verification rate 94%, avg quality 78/100"
- "Verification rate dropped from 100% to 80% on run #7 — fabrication detected"
- No charting library needed. Styled divs with percentage heights work fine for a sparkline.

**What it proves:** RECEIPT isn't a one-shot tool. It's a monitoring system that catches degradation over time. This is the difference between a hackathon demo and a production tool.

---

### 2.3 Receipt Weight Visualization — Which actions mattered most?

The usefulness review already computes per-receipt weights (how much each receipt contributed to the final quality score). This data exists in the `receiptWeights` array but isn't visualized.

**Demo page (`demo/app/app/demo/page.tsx`):**
- On each receipt card in done state: add a thin vertical bar on the left edge showing relative weight. Tallest bar = highest contribution to quality score.
- Or: opacity gradient — high-weight receipts fully opaque, low-weight faded.
- At the bottom of done state: "Highest impact: Receipt #3 (LLM Inference) — 28% of quality score. Lowest: Receipt #1 (File Read) — 4%."

**Why it matters for harness framing:** This is the foundation for routing optimization. If inference always contributes 30% to quality but file_read only 5%, you know where to invest compute budget. Cursor's harness routes to the best model for each task — RECEIPT tells you which tasks matter most.

---

### 2.4 SDK Enhancement: Middleware Pattern

Currently wrapping an agent requires creating a `ReceiptAgent` and calling methods like `readFile()`, `callLlm()`, etc. For production adoption, agents should be able to add RECEIPT with minimal code.

**New SDK export: `createReceiptMiddleware()`**

```typescript
import { createReceiptMiddleware } from 'agenticproof';

const middleware = createReceiptMiddleware({
  agentName: 'my-agent',
  onChainComplete: (chain) => console.log('Chain:', chain.rootHash),
});

// Wrap any async function — RECEIPT handles the rest
const result = await middleware.wrap('llm_call', 'Ask about weather', async () => {
  return await openai.chat.completions.create({ ... });
});

// Or use as Express/Next.js middleware
app.use(middleware.express());
```

**File:** `packages/receipt-sdk/src/middleware.ts`
- `createReceiptMiddleware(config)` → returns `{ wrap, express, nextjs, getChain, verify }`
- `wrap(actionType, description, fn)` → executes fn, creates receipt from input/output, links chain
- `express()` → returns Express middleware that wraps every request/response in a receipt
- `nextjs()` → returns Next.js middleware (same pattern)
- `getChain()` → returns current chain
- `verify()` → verifies own chain

**Update `packages/receipt-sdk/package.json`** exports to include `./middleware`.

**Why:** Judges who are also developers will ask "how do I actually use this?" The answer should be "3 lines of code." This is the adoption play.

---

### 2.5 Training Data Visualization

The training data pipeline exists (`/api/training-data`, SDK's `chainToFineTuningDataset()`). Quality-gated: only chains scoring ≥60/100 become training data. But judges can't see this.

**Demo page done state or Trial page:**
- After quality score appears, if score ≥ 60, show a "Training Data" card:
  - "This chain qualifies for fine-tuning (score: 82/100, threshold: 60)"
  - Show the JSONL output preview: 3-4 example training examples generated from this chain
  - Show stats: "8 training examples generated, compatible with Qwen2.5-0.5B-Instruct, Qwen3-32B"
  - If score < 60: "This chain is below the quality threshold (score: 45/100). Bad work doesn't become training data."
- Add a button: "Export Training Data" → downloads the JSONL file.

**Why:** This closes the quality flywheel loop visually. Agents do work → RECEIPT verifies → good work trains better models → better agents. Judges see the full cycle.

---

## TIER 3 — Cherry on top (if time permits)

### 3.1 Cost-Per-Useful-Output Comparison

Already computed in the demo (`costPerUseful = cost / (reviewScores.composite / 100)`). Extend this:

**New API route: `demo/app/app/api/cost-analysis/route.ts`**
- Pull all saved chains.
- Compute: avg cost per useful output, cost variance, cheapest run, most expensive run.
- Show: "You're spending $0.0012 per useful output on average. The industry benchmark for agent monitoring is $0.005." (make the benchmark up, it's a hackathon)

### 3.2 Live Chain Streaming from Claude Code

The SDK docs mention Claude Code hooks (`~/.receipt/chains/*.json`). If Oscar has any chains from actual Claude Code usage:
- Show them in `/team` feed with real timestamps and real actions
- This proves RECEIPT works beyond the demo — it's capturing real development work
- If no real chains exist, create a script that generates realistic chains from Claude Code-like actions (file reads, bash commands, edit operations)

### 3.3 A2A Protocol Demo

The `AxlTransport` already has `sendHandoffA2A()` that wraps payloads in JSON-RPC 2.0 `SendMessage` envelopes. This is Google's Agent-to-Agent protocol. If there's time:
- Add an A2A toggle to the demo: "Standard Handoff" vs "A2A Protocol Handoff"
- Show the protocol envelope in the UI when A2A is selected
- This positions RECEIPT as compatible with the emerging standard

### 3.4 MCP Tool Receipt Integration

The `AxlTransport` has `callMcpTool()` for routing MCP tool calls through AXL. If there's time:
- Show a receipt being created for an MCP tool call
- This proves RECEIPT can wrap MCP servers — huge for the ecosystem

---

## Navigation Update

Add `/reputation` to the nav bar on ALL pages. Current nav: Home | Live | Team | Verify | Eval | GitHub. New: Home | Live | Trial | Team | Verify | Eval | Reputation | GitHub.

Also: make sure `/trial` is in the nav. It's built but not linked from the nav on some pages.

---

## Don't Break These

- The adversarial mode in `/demo` — it's the best demo moment. Don't change the flow.
- The guided walkthrough chapters — they pace the demo perfectly.
- The verify page client-side crypto — it's real and impressive.
- The AXL fallback to HTTP — it works reliably when AXL nodes are down.
- The 47 SDK tests — run `npm test` after any SDK changes.

---

## After Building — Update These

**SUBMISSION.md:**
- Update "What We Built" with any new pages/features.
- Update the long description to lead with "Verification Rate" as the named metric.
- Add "Agent Reputation leaderboard with on-chain proof" if built.
- Add "Constitutional AI evaluation with measurable critique improvement" with specific numbers.
- Add "3-line middleware integration for any agent framework" if SDK middleware is built.

**DEMO-SCRIPT.md:**
- Update beats to mention harness layer indicator during walkthrough.
- Add a beat for the eval page if critique UI is built.
- Add a beat for reputation page if built.
- The demo can be longer than 3 minutes if the content is good — just keep it tight.

**README.md:**
- Update architecture diagram if new pages/routes were added.
- Add middleware quickstart if built.

---

## The phrase every judge should remember

**"Cursor built keep rates for code. We built verification rates for everything else."**

Every UI change, every new feature, every line of submission text should serve this one sentence. If a change doesn't make the verification rate story clearer, stronger, or more compelling — skip it.
