# KeeperHub Integration Feedback — RECEIPT

**Project:** RECEIPT (proof layer for agent work)
**Bounty:** ETHGlobal Open Agents — KeeperHub track
**Date:** 2026-04-24
**Integration scope:** Scheduled auto-anchoring of receipt chains via KeeperHub workflows

---

## What We Built

RECEIPT produces signed, hash-linked receipts for every action an AI agent takes. Receipt chains get anchored on-chain (Base Sepolia + 0G Chain) for permanent verifiability.

We integrated KeeperHub as the **scheduler and trigger layer** for automated anchoring:

1. **Auto-anchor workflow** — KeeperHub invokes our webhook every 10 minutes to scan for unanchored receipt chains, verify them, store to 0G, and anchor on both chains.
2. **Webhook handler** — A POST endpoint that KeeperHub calls, which orchestrates the full verify-store-anchor pipeline.
3. **SDK integration** — `createKeeperHubClient()` with `scheduleAnchor()`, `triggerAnchor()`, and `getWorkflowStatus()` methods.

---

## What Worked Well

- **Workflow model makes sense.** The trigger → action → edge graph maps cleanly to our use case. A webhook trigger feeding into a contract write is exactly the right abstraction for "run this on a schedule."
- **API structure is intuitive.** `POST /api/workflows` with nodes/edges is a natural fit for anyone who has used workflow automation tools. The mental model transfers from Zapier/n8n without friction.
- **Webhook-first design.** Supporting both scheduled execution and on-demand webhook triggers is the right call for agent infrastructure. Agents need both "run every N minutes" and "run right now because a chain just completed."

---

## Friction Points

### 1. API documentation is incomplete

We could not find comprehensive API reference documentation for KeeperHub's REST endpoints. The workflow creation API, scheduling API, and execution status API had to be reverse-engineered from the app UI and trial-and-error. Specific gaps:

- **No OpenAPI/Swagger spec.** For a developer-facing product, a machine-readable API spec is table stakes. We had to guess at field names and response shapes.
- **Missing error response documentation.** When requests fail, we do not know what error codes to expect or what the error body structure looks like. We had to wrap everything in generic catch blocks.
- **Scheduling endpoint unclear.** We assumed `POST /api/workflows/{id}/schedule` with a `cron` field, but could not confirm this from docs. Is it cron syntax? Is it a different format? What are the minimum intervals?

### 2. Onboarding gap for programmatic usage

The product seems oriented toward a visual workflow builder (drag-and-drop UI). That is great for non-developers, but for the agent/automation use case — where we are creating workflows programmatically — the experience is rough:

- **No SDK or client library.** We wrote our own `createKeeperHubClient()` from scratch. A published npm package (`@keeperhub/sdk`) with TypeScript types would dramatically reduce integration time.
- **No "quick start for developers" guide.** The docs we found focused on the UI. A page showing "here is how to create a workflow via the API, schedule it, and trigger it" with curl examples would save hours.

### 3. Webhook payload schema is undocumented

When KeeperHub calls our webhook:
- What headers does it send? Is there a signature header for validation?
- What is the payload structure? Does it include metadata about the workflow run?
- Is there a retry policy? If our endpoint returns 500, does KeeperHub retry?

We had to design our webhook handler defensively because we could not find answers to these questions.

### 4. MCP integration not yet usable for our case

KeeperHub advertises MCP server support, which would be powerful for agent-to-agent workflows. However:
- We could not find documentation on how to use KeeperHub as an MCP server or connect it as an MCP client.
- For RECEIPT, the ideal flow would be: agent finishes work → calls KeeperHub MCP tool → KeeperHub schedules anchoring. This is not possible today without the webhook workaround.

### 5. No test/sandbox environment documented

We did not find a sandbox or test mode:
- Can we create test workflows that do not actually execute contract writes?
- Is there a staging API endpoint?
- Can we dry-run a workflow to validate the node graph without side effects?

For development and hackathon purposes, a sandbox mode would prevent accidental on-chain transactions during testing.

---

## Feature Requests

### 1. Built-in web3 receipt/proof pattern
KeeperHub already supports `web3/write-contract`. A first-class "anchor hash on-chain" template with pre-configured ABI for common patterns (store a bytes32, emit an event) would be a one-click setup instead of manual node configuration.

### 2. Execution history API with filtering
`GET /api/workflows/{id}/executions?status=failed&since=2024-01-01` — being able to query execution history programmatically is critical for monitoring. If an anchor fails at 3am, we need to know without checking the UI.

### 3. Webhook signature verification
Sign outbound webhook calls with HMAC-SHA256 using a per-workflow secret. This is standard practice (GitHub, Stripe, etc.) and required for production use. Without it, anyone who discovers the webhook URL can trigger arbitrary anchoring.

### 4. x402 payment integration clarity
KeeperHub mentions x402 payment rails. For our use case, the ideal model would be: each anchoring costs X, the agent's wallet pays per-execution via x402. But we could not find documentation on how this works in practice — is it per-workflow, per-execution, or per-action?

---

## Summary

KeeperHub fills a real gap in the agent infrastructure stack: scheduled, reliable execution of on-chain operations. The workflow model is sound and the webhook trigger pattern works for our use case. The main barrier to adoption is documentation — the API surface seems capable, but discovering how to use it programmatically requires too much guesswork. An SDK, an OpenAPI spec, and a developer quick-start guide would move KeeperHub from "promising" to "production-ready" for agent builders.
