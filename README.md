# R.E.C.E.I.P.T.

### Record of Every Computational Event with Immutable Proof and Trust

**[Live Demo](https://receipt-murex.vercel.app)** · [Live](https://receipt-murex.vercel.app/demo) · [Trial](https://receipt-murex.vercel.app/trial) · [Team](https://receipt-murex.vercel.app/team) · [Verify](https://receipt-murex.vercel.app/verify) · [Eval](https://receipt-murex.vercel.app/eval) · [Reputation](https://receipt-murex.vercel.app/reputation)

**The evaluation layer every agent harness needs.** Claude Code, Cursor, OpenClaw, Hermes -- agents are shipping everywhere. RECEIPT measures whether their work was actually useful. Signed, hash-linked receipts for verifiable AI agent handoffs with TEE-attested quality scoring.

**Layer 1 — Proof of Action.** Every agent action — reading a file, calling an API, running inference, making a decision — produces a cryptographically signed receipt (ed25519 + SHA-256). Receipts hash-link into a tamper-proof chain. Any modification breaks the chain. When The Builder receives work from The Researcher, it independently verifies every receipt before continuing.

**Layer 2 — Proof of Usefulness.** After verification, a TEE-attested LLM review scores the chain's output quality on three axes: alignment, substance, and quality (each 0-100). The review itself becomes a signed receipt — so the quality assessment is as tamper-proof as the work it evaluates.

**Why TEE matters here.** The review must be trustworthy. A regular LLM call could be spoofed — an operator could fake high scores. 0G Compute TEE attestation (Intel TDX) means the scoring ran inside a hardware enclave and can't be fabricated. The reviewer model is selected inside the enclave too — agents can't pick their own grader.

**The feedback loop.** Usefulness scores anchor on-chain alongside the receipt hash — creating on-chain agent reputation. Only chains scoring above a quality threshold become fine-tuning data. The system self-improves: good agent work trains better agents, bad work is excluded.

**Deployed Contracts (0G Mainnet):**
- ReceiptAnchorV2: [`0x73B9A7768679B154D7E1eC5F2570a622A3b49651`](https://chainscan.0g.ai/address/0x73B9A7768679B154D7E1eC5F2570a622A3b49651) — stores usefulness scores on-chain
- AgentNFT: [`0xf964d45c3Ea5368918B1FDD49551E373028108c9`](https://chainscan.0g.ai/address/0xf964d45c3Ea5368918B1FDD49551E373028108c9) — ERC-7857 agent identity
- ValidationRegistry: [`0x2E32E845928A92DB193B59676C16D52923Fa01dd`](https://chainscan.0g.ai/address/0x2E32E845928A92DB193B59676C16D52923Fa01dd) — ERC-8004 agent proof attestations

## Architecture

```
The Researcher                    The Builder
  │                                  │
  ├─ file_read → receipt₁            │
  ├─ api_call  → receipt₂            │
  ├─ llm_call  → receipt₃            │
  ├─ decision  → receipt₄            │
  ├─ output    → receipt₅            │
  │                                  │
  └──── handoff (peer-to-peer) ──────┤
                                     ├─ verify chain (ed25519 + hash links)
                                     ├─ file_read → receipt₆
                                     ├─ api_call  → receipt₇
                                     ├─ decision  → receipt₈
                                     ├─ output    → receipt₉
                                     └─ usefulness_review → receipt₁₀  (TEE-attested)
                                            │
                                    compute root hash
                                            │
                  ┌─────────────┬───────────┼───────────┬──────────────┬──────────────┐
                  │             │                       │              │              │
            0G Storage    0G Mainnet              0G Fine-Tune     AgentNFT    Validation
           (Merkle root)  (anchor tx)            (TEE upload)    (ERC-7857)   (ERC-8004)
```

## Three Verification Layers

One pipeline run exercises verified compute, verified identity, and verified training — the full stack.

**Verified Compute — 0G Sealed Inference (TEE)**
Every LLM call runs inside an Intel TDX hardware enclave via `@0glabs/0g-serving-broker`. Used twice per pipeline: once for the Researcher's analysis inference, once for the Builder's independent quality review. The reviewer model is TEE-selected — the agent can't choose its own grader. Each receipt carries attestation metadata: provider address, TEE type, and a verifiable signature endpoint.

**Verified Identity — ERC-7857 Agentic ID**
Each agent mints a soulbound on-chain identity NFT via `AgentNFT.sol`. The NFT carries the agent's ed25519 public key hash and receipt chain root as `iDatas`. Supports the full iNFT lifecycle: mint, transfer, clone, authorizeUsage. Trust scores evolve as the agent builds on-chain reputation through verified work. Designed to be composable with the emerging ERC-8004 (Trustless Agents) standard — RECEIPT receipts map to ERC-8004 Validation Registry responses.

**Verified Training — Quality-Gated Fine-Tuning**
Only chains scoring ≥60/100 usefulness become training data. The pipeline discovers fine-tuning providers, uploads high-quality chains via TEE, and attempts LoRA deployment. Low-quality chains are excluded — the system self-improves by only training on proven good work.

## Partner Integrations

### 0G — Full Stack

All five 0G modules working as a coherent system:

- **Compute** — TEE-attested inference via Intel TDX enclaves. Dual use: Researcher inference (DeepSeek V3) and Builder quality review (GLM-5). Tries 4 provider addresses with automatic fallback. Real `processResponse()` for TEE signature verification.
- **Storage** — Content-addressed persistence via Merkle trees using `@0gfoundation/0g-ts-sdk`. Receipt chains serialize to bytes, get Merkle-treed, and upload to 0G storage nodes.
- **Chain** — `ReceiptAnchorV2.sol` on 0G Mainnet (chain ID 16661). `anchorRoot(bytes32, bytes32, uint8)` stores chain root hash, storage reference, and usefulness score permanently. Quality gate: chains scoring below 60/100 are NOT anchored.
- **Fine-Tuning** — Quality-gated training pipeline. After `createFineTuningTask()`, attempts `resolveAdapterName()` → `deployAdapterByName()` to close the loop.
- **Agentic ID (ERC-7857)** — On-chain agent identity NFT with dynamic trust scoring based on verified work history.
- **KV Store** — Agent reputation registry via `KvClient`/`StreamDataBuilder`/`Batcher`. Each run writes the usefulness score to a queryable KV stream.

### Gensyn AXL — Agent-to-Agent Transport

Agent-to-agent transport is powered by Gensyn AXL. When the Researcher completes its chain, the receipt bundle travels peer-to-peer via AXL — no central server touches it. The Builder receives, verifies, and extends the chain independently.

The SDK integration (`packages/receipt-sdk/src/integrations/axl.ts`) provides:
- Peer discovery via `/topology`
- A2A agent card discovery via `/a2a/{peerId}`
- Handoff via `sendHandoffA2A()` with JSON-RPC 2.0 `SendMessage` envelope
- MCP tool calls via `callMcpTool()` (verify_chain, get_capabilities, get_chain_stats)
- Broadcast to all peers via `broadcastHandoff()`

When AXL is unavailable: direct HTTP handoff (clearly marked), no simulated data.

Standalone demos:
- `demo/axl/sender.ts` — Creates receipt chain, sends handoff bundle to peer
- `demo/axl/receiver.ts` — Receives bundle, verifies chain, extends with new receipts

## Demo Pages

- **[Live Demo](https://receipt-murex.vercel.app/demo)** — Watch Researcher + Builder generate receipts in real-time. Honest mode + adversarial tamper detection. Verification rate hero metric, 6 harness layer pills, receipt impact visualization, training data qualification.
- **[Trial](https://receipt-murex.vercel.app/trial)** — Execution replay with timeline visualization, token/time/quality metrics, human review (becomes receipt #11), and comparison mode.
- **[Team](https://receipt-murex.vercel.app/team)** — Multi-agent chain feed. Aggregates receipt chains from Claude Code hooks and OpenClaw plugin. Filter by source, inspect receipt timelines, verify any chain.
- **[Verify](https://receipt-murex.vercel.app/verify)** — Independent chain verifier using WebCrypto (ed25519 + SHA-256). Paste any chain and see exactly where it breaks.
- **[Eval](https://receipt-murex.vercel.app/eval)** — Constitutional AI evaluation harness. 60 test cases, 3 model evaluators, self-critique loop, consensus accuracy, dramatic disagreement cards.
- **[Reputation](https://receipt-murex.vercel.app/reputation)** — Agent leaderboard with verification rate, degradation tracking sparkline, and cost-per-useful-output analysis.

## Project Structure

```
packages/
  receipt-sdk/                  npm: agenticproof — types, crypto, chain, agent, verify, integrations
  receipt-cli/                  CLI tool — run, verify, inspect, export, anchor
  openclaw-plugin-receipt/      OpenClaw plugin — native agent lifecycle hooks

contracts/
  ReceiptAnchorV2.sol           On-chain anchor — stores usefulness scores (deployed on 0G Mainnet)
  AgentNFT.sol                  ERC-7857 Agentic Identity NFT contract
  ValidationRegistry.sol        ERC-8004 agent proof attestations (deployed on 0G Mainnet)

demo/
  app/                          Next.js demo — 8 pages (home, live demo, trial, team, verify, eval, reputation, dashboard)
  agents/                       Standalone agent scripts (researcher → builder handoff)
  axl/                          Gensyn AXL P2P demo (sender + receiver)
```

## Wrap Any Agent in 10 Lines

```bash
npm install agenticproof
```

```typescript
import { createAgentRun, wrapTool } from 'agenticproof';

const run = createAgentRun({ agentId: 'my-agent' });

run.contextRead('task', 'Audit vault-protocol for reentrancy');
const search = wrapTool(run, 'search_code', mySearchFunction);
const results = await search({ query: 'withdraw', repo: 'vault-protocol' });
run.decision('No critical vulnerabilities found', 'Recommend gas optimization');
run.messageSend('user', 'Audit complete. No issues.');

const chain = run.finalize();
console.log(chain.valid); // true — every action signed and hash-linked
```

## Middleware — 3 Lines

```typescript
import { createReceiptMiddleware } from 'agenticproof';

const middleware = createReceiptMiddleware({ agentName: 'my-agent' });
const result = await middleware.wrap('llm_call', 'Analyze data', async () => {
  return await llm.chat('Analyze this dataset');
});
const chain = middleware.getChain();
```

## OpenClaw Plugin — Zero-Code Agent Receipting

For OpenClaw-based agents, install the plugin and every agent run gets receipted automatically:

```bash
openclaw plugins install openclaw-plugin-receipt
```

No code changes needed. The plugin hooks into the agent lifecycle:

| Agent Action | Receipt Type | Hook |
|-------------|-------------|------|
| Loading context/memory | `context_read` | `before_prompt_build` |
| Calling a tool | `tool_call` | `before_tool_call` |
| Tool returns result | `tool_result` | `after_tool_call` |
| Sending a message | `message_send` | `message_sending` |
| Final answer | `decision` | `agent_end` |

Chains are queryable via HTTP on the gateway:

```bash
curl http://localhost:18789/plugins/receipt/latest    # most recent chain
curl http://localhost:18789/plugins/receipt/chains     # all chains
curl http://localhost:18789/plugins/receipt/verify/ID  # verify integrity
```

See [`packages/openclaw-plugin-receipt/`](packages/openclaw-plugin-receipt/) for full docs.

## Claude Code — Hook-Based Receipting

Every file read, edit, bash command, and agent spawn becomes a signed receipt:

```bash
npx receipt init --claude-code
```

This installs hooks into `.claude/settings.json`. Chains are written to `.receipt/chains/` when a session ends. No code changes, no manual wrapping — just install and every Claude Code action gets receipted.

See [`examples/claude-code-hooks/`](packages/receipt-sdk/examples/claude-code-hooks/) for details.

## Cursor — File Watcher Receipting

For Cursor's agent mode, a lightweight watcher monitors file changes:

```bash
npx receipt init --cursor
node .receipt/cursor-watcher.mjs
```

Every file Cursor's agent edits becomes a receipt. Press Ctrl+C to finalize the chain.

## Works With Any Agent

| Agent | Integration | Setup |
|-------|------------|-------|
| **OpenClaw** | Native plugin (lifecycle hooks) | `openclaw plugins install openclaw-plugin-receipt` |
| **Claude Code** | Hooks (PostToolUse, SessionStart, Stop) | `npx receipt init --claude-code` |
| **Cursor** | File watcher | `npx receipt init --cursor` |
| **Custom agents** | SDK wrapper (10 lines) | `npm install agenticproof` |

A team of 3 people running 2-3 agents each = 9 agents, all producing receipt chains. RECEIPT tells you which ones earned their keep and which ones burned tokens for nothing. Cost-per-useful-output across your entire agent fleet.

## SDK: Lower-Level Usage

```typescript
import { ReceiptAgent, verifyChain } from 'agenticproof';

const researcher = ReceiptAgent.create('researcher');
researcher.readFile('config.json', fileContents);
researcher.callApi('https://api.example.com', apiResponse);
researcher.callLlm('analyze this codebase', llmOutput);
researcher.decide('analysis reasoning', 'proceed with deployment');
researcher.produceOutput('research report', reportJson);

const builder = ReceiptAgent.continueFrom(researcher.getReceipts());
const results = verifyChain(researcher.getReceipts(), researcher.getPublicKey());
const allValid = results.every(r => r.valid); // true
```

## Quick Start

```bash
# Install SDK
npm install agenticproof

# Run tests (47 passing)
cd packages/receipt-sdk && npm test

# Run demo app
cd demo/app && npm install && npm run dev

# CLI
npx receipt verify chain.json
npx receipt inspect chain.json
```

## Examples

```bash
# Wrap OpenClaw with receipts
npx tsx packages/receipt-sdk/examples/wrap-openclaw.ts

# Two-machine handoff via Gensyn AXL
npx tsx packages/receipt-sdk/examples/two-machine-handoff.ts

# Basic agent wrapping
npx tsx packages/receipt-sdk/examples/wrap-agent.ts
```

## Environment Variables

```
PRIVATE_KEY=wallet_private_key
OG_CONTRACT_ADDRESS=0x73B9A7768679B154D7E1eC5F2570a622A3b49651
AGENT_NFT_ADDRESS=0xf964d45c3Ea5368918B1FDD49551E373028108c9
VALIDATION_REGISTRY_ADDRESS=0x2E32E845928A92DB193B59676C16D52923Fa01dd
OG_COMPUTE_PROVIDER=0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C
AXL_BASE_URL=http://127.0.0.1:9002  # optional, for live AXL
```

## Tests — 47 Passing

```bash
cd packages/receipt-sdk && npm test
```

Covers: agent creation, all 6 action types (including usefulness_review), hash chain integrity, ed25519 signature verification, tamper detection, `continueFrom` handoffs, `verifyChain` pass/fail, `computeRootHash`, training data conversion, AXL handoff payloads, serialization, and attestation metadata.

## Built With

### AI Tools
- **Claude Code** (Anthropic) — Implementation, code generation, debugging, and iteration

### Human Contributions (Oscar)
- Architecture design — the receipt chain mechanic, hash-linking strategy, and multi-agent handoff protocol
- Product decisions — what to build, what to skip, scope management
- Integration strategy — 0G full-stack integration, Gensyn AXL for P2P transport
- Demo direction — adversarial mode, execution replay, cost-per-useful-output metric, human review as receipt #11
- Deployment and operations — contract deployment, Vercel configuration, environment setup

### Stack
- TypeScript, Next.js 15, ed25519 (@noble/ed25519), SHA-256 (@noble/hashes)
- Solidity (ReceiptAnchorV2.sol, AgentNFT.sol)
- 0G SDK (@0gfoundation/0g-ts-sdk v1.2.6, @0glabs/0g-serving-broker)
- Gensyn AXL (AxlTransport SDK, A2A protocol, MCP tool calls)

## License

MIT
