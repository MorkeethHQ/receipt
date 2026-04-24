# KeeperHub Integration Feedback — RECEIPT

**Project:** RECEIPT (Record of Every Computational Event with Immutable Proof and Trust)
**Bounty:** ETHGlobal Open Agents — KeeperHub track
**Date:** 2026-04-24
**Team:** Oscar (PM/Architect) + Claude Code (implementation)
**Integration scope:** Scheduled auto-anchoring of receipt chains via KeeperHub workflows

---

## What We Built

RECEIPT is a cryptographic proof layer for AI agent work. Every action an agent takes produces a signed, hash-linked receipt. Receipt chains get anchored on-chain for permanent verifiability.

We integrated KeeperHub as the **scheduler and trigger layer** for automated anchoring — the critical "last mile" that moves receipt chains from ephemeral memory to permanent on-chain storage. Without KeeperHub, anchoring would require manual intervention or a self-hosted cron job.

### Integration components:

1. **Webhook handler** (`/api/keeperhub`) — A POST endpoint that KeeperHub calls on schedule. It scans for unanchored receipt chains, verifies each chain's cryptographic integrity, stores the data to 0G Storage, and anchors the root hash on both 0G Mainnet and Base Sepolia. Also exposes a GET health check for KeeperHub to verify the endpoint is alive.

2. **Setup script** (`demo/keeperhub/setup-workflow.ts`) — Registers a workflow with KeeperHub via the API: a webhook trigger node connected to a `web3/write-contract` action node, scheduled to fire every 10 minutes.

3. **Manual trigger** (`demo/keeperhub/auto-anchor.ts`) — CLI script to trigger the workflow on-demand for testing or after a batch of agent work completes. Supports `--poll` mode to wait for execution completion.

4. **SDK client** (`packages/receipt-sdk/src/integrations/keeperhub.ts`) — `createKeeperHubClient()` wrapping the KeeperHub REST API with typed methods: `createWorkflow()`, `scheduleAnchor()`, `triggerAnchor()`, `getWorkflowStatus()`, `listExecutions()`, `pauseWorkflow()`, `resumeWorkflow()`, and `deleteWorkflow()`.

---

## What Worked Well

### Workflow model is the right abstraction
The node-and-edge graph for workflows (trigger node -> action node, connected by edges) maps cleanly to our use case. A webhook trigger feeding into a contract write is exactly the right level of abstraction for "run this pipeline on a schedule." We did not need to fight the data model — it naturally expressed what we wanted.

### API structure is intuitive
`POST /api/workflows` with `{ name, nodes, edges }` is a natural fit for anyone who has used workflow automation tools. The mental model transfers from Zapier, n8n, or Temporal without friction. Creating a workflow, scheduling it, and triggering it are three separate, composable operations — that is the right design.

### Webhook-first design
Supporting both scheduled execution (cron) and on-demand webhook triggers is exactly what agent infrastructure needs. Agents need both "run every 10 minutes to catch any unanchored chains" and "run right now because a chain just finished." KeeperHub supports both modes through the same workflow, which is elegant.

### Web3-native node types
The `web3/write-contract` node type signals that KeeperHub understands its target audience. For RECEIPT, being able to specify a chain, contract address, and method in a workflow node — rather than having to wrap everything in a generic HTTP call — reduces integration complexity.

---

## What Was Challenging

### 1. API documentation is incomplete

This was the biggest friction point. We could not find comprehensive API reference documentation for KeeperHub's REST endpoints. The workflow creation API, scheduling API, and execution status API had to be reverse-engineered from the app UI and trial-and-error. Specific gaps:

- **No OpenAPI/Swagger spec.** For a developer-facing product, a machine-readable API spec is table stakes. We had to guess at field names, required vs. optional fields, and response shapes. Our `createKeeperHubClient()` was written based on assumptions about the API surface, not confirmed documentation.
- **Missing error response documentation.** When requests fail, we do not know what error codes to expect or what the error body structure looks like. We had to wrap everything in generic try-catch blocks and surface raw error text. A documented error schema (e.g., `{ error: string, code: string, details?: object }`) would let us write meaningful error handling.
- **Scheduling endpoint format unclear.** We assumed `POST /api/workflows/{id}/schedule` with a `{ cron: "*/10 * * * *" }` body, but could not confirm this from docs. Is it standard cron syntax? Are there minimum interval restrictions? Does it support timezone configuration? These questions had to be answered by experimentation.
- **Execution history endpoint undocumented.** We added `listExecutions()` to our SDK but have no confirmation that `GET /api/workflows/{id}/executions` exists or what its response shape looks like.

### 2. No published SDK or client library

We built our own TypeScript client from scratch (`createKeeperHubClient()`). This works, but it means:
- We had to guess at the complete API surface
- We cannot benefit from SDK updates when KeeperHub adds features
- Type safety is based on our assumptions, not ground truth

A published `@keeperhub/sdk` npm package with TypeScript types would dramatically reduce integration time. Even a minimal one covering workflow CRUD, scheduling, and triggering would save hours per integration.

### 3. Webhook payload schema is undocumented

When KeeperHub calls our webhook endpoint, we had to design defensively because we could not answer these questions:
- **What headers does KeeperHub send?** Is there a `X-KeeperHub-Signature` header for HMAC validation?
- **What is the payload structure?** Does it include metadata about the workflow execution (execution ID, triggered-at timestamp, workflow ID)?
- **What is the retry policy?** If our endpoint returns 500, does KeeperHub retry? How many times? With what backoff?
- **What response does KeeperHub expect?** Does it check for a 200 status? Does it parse the response body?

We built our webhook handler to accept both direct receipts (receipts in the payload) and scheduled scan mode (empty payload triggers a scan of pending chains), but we do not know which mode KeeperHub actually uses.

### 4. No test/sandbox environment

We did not find a sandbox mode or staging API:
- Can we create test workflows that execute but skip the actual contract write?
- Is there a staging endpoint (`https://sandbox.api.keeperhub.xyz`)?
- Can we dry-run a workflow to validate the node graph without side effects?

During development, we had to be careful not to accidentally trigger real on-chain transactions. A `{ dryRun: true }` flag on the trigger endpoint would solve this.

### 5. MCP integration not yet usable for agents

KeeperHub mentions MCP (Model Context Protocol) server support. For RECEIPT, the ideal flow would be: agent finishes work -> calls KeeperHub as an MCP tool -> KeeperHub schedules anchoring. This would eliminate the webhook intermediary entirely. However, we could not find documentation on how to connect KeeperHub as an MCP server, what tools it exposes, or how authentication works in the MCP context.

---

## Suggestions for Improvement

### Priority 1: Developer documentation
- Publish an OpenAPI spec at a well-known URL
- Add a "Quick Start for Developers" page with curl examples for the full lifecycle: create workflow -> schedule -> trigger -> check status
- Document every endpoint's request body, response body, and error codes
- Document webhook outbound payload format and signature verification

### Priority 2: Published SDK
- Ship `@keeperhub/sdk` on npm with TypeScript types
- Include a `KeeperHubError` class with typed status codes
- Add retry logic and timeout configuration
- Make it isomorphic (works in Node.js, Deno, Bun, and edge runtimes)

### Priority 3: Webhook security
- Sign outbound webhook calls with HMAC-SHA256 using a per-workflow secret
- Include a `X-KeeperHub-Signature` header (this is standard practice from GitHub, Stripe, Slack, etc.)
- Document the retry policy and expected response format

### Priority 4: Developer experience
- Add a `dryRun` mode for workflows
- Expose execution logs via API (`GET /api/workflows/{id}/executions/{executionId}/logs`)
- Support workflow templates (e.g., "anchor hash on-chain" as a one-click setup)
- Add webhook delivery logs visible in the dashboard for debugging

### Priority 5: x402 payment clarity
KeeperHub mentions x402 payment rails. For our use case, the model that would work is: each anchoring execution costs X tokens, the agent's wallet pays per-execution via x402. But we could not determine from documentation whether pricing is per-workflow, per-execution, or per-action-node, and how the payment flow integrates with the API.

---

## How It Compares to Alternatives

| Criteria | KeeperHub | Cron job (self-hosted) | GitHub Actions | Gelato/Chainlink Keepers |
|---|---|---|---|---|
| Setup complexity | Low (API call) | Medium (server + crontab) | Low (YAML file) | Medium (smart contract) |
| Web3 native | Yes | No | No | Yes |
| Webhook triggers | Yes | No (need wrapper) | Yes (webhook events) | No (on-chain only) |
| Scheduling | Yes (cron) | Yes (cron) | Yes (cron) | Yes (time-based) |
| Cost | TBD (x402) | Server costs | Free tier available | Per-execution gas |
| Agent-oriented | Yes | No | No | No |

KeeperHub's positioning for the **agent infrastructure** niche is its strongest differentiator. Cron jobs work but require a server. GitHub Actions works but is not web3-native. Gelato/Chainlink Keepers are web3-native but do not support webhook triggers or off-chain orchestration. KeeperHub sits in the intersection of "web3-native" and "off-chain workflow automation" — that is the right quadrant for agent builders.

---

## Overall Assessment

**Rating: 7/10 — Promising foundation, needs documentation polish**

The core product concept is sound. KeeperHub fills a real gap in the agent infrastructure stack: reliable, scheduled execution of on-chain operations triggered by off-chain events. The workflow model, the webhook-first design, and the web3-native node types all demonstrate a clear understanding of what agent builders need.

The gap between "promising" and "production-ready" is almost entirely documentation and developer experience. The API surface appears capable — we were able to build a full auto-anchoring pipeline — but the integration required more guesswork than it should have. Shipping an OpenAPI spec, a TypeScript SDK, and a developer quick-start guide would move KeeperHub from "interesting hackathon tool" to "default choice for agent scheduling."

**Would we use it in production?** Not yet, but we would revisit when:
1. API documentation is comprehensive
2. Webhook signature verification is available
3. An official SDK exists with proper error types
4. Execution history is queryable via API

The foundation is there. The infrastructure layer for AI agents is still being defined, and KeeperHub is well-positioned to own the scheduling and orchestration piece of that stack.
