# RECEIPT for Claude Code

Cryptographic receipt for every tool call Claude Code makes. File reads, edits, bash commands, web searches, agent spawns — all signed and hash-linked.

## Setup (30 seconds)

```bash
# 1. Copy the hook into your project
mkdir -p .receipt
cp receipt-hook.mjs .receipt/

# 2. Add hooks to Claude Code settings
# Copy the hooks block from settings.json into .claude/settings.json
```

Or use the CLI:

```bash
npm install -g agenticproof
receipt init --claude-code
```

## What gets receipted

| Claude Code Tool | Receipt Type | Description |
|-----------------|-------------|-------------|
| Read | `file_read` | Read src/index.ts |
| Write | `output` | Write dist/bundle.js |
| Edit | `output` | Edit src/utils.ts |
| Bash | `tool_call` | Bash: npm test |
| WebFetch | `api_call` | Fetch URL |
| WebSearch | `api_call` | Search: query |
| Agent | `tool_call` | Agent: description |
| Grep, Glob | `tool_call` | Search operations |

## How it works

1. **SessionStart** — creates a new receipt chain with ed25519 keypair
2. **PostToolUse** — every tool call becomes a signed receipt (async, doesn't slow Claude down)
3. **Stop** — finalizes the chain, writes to `.receipt/chains/`

Chains are JSON files you can verify:

```bash
receipt verify .receipt/chains/session-123-1714000000.json
receipt inspect .receipt/chains/session-123-1714000000.json
```

## Multi-agent scenario

Three people on a team, each running Claude Code:

```
Person A (backend)     → .receipt/chains/session-a-*.json
Person B (frontend)    → .receipt/chains/session-b-*.json
Person C (infra)       → .receipt/chains/session-c-*.json
```

Every chain shows exactly what each agent did, how long it took, and whether it was useful. Compare cost-per-useful-output across agents and people.

## Chain format

```json
{
  "runId": "claude-code-abc123-1714000000",
  "sessionId": "abc123",
  "agentId": "claude-code",
  "receipts": [...],
  "rootHash": "a1b2c3...",
  "valid": true,
  "stats": { "total": 42, "byType": { "file_read": 12, "tool_call": 18, "output": 8, "api_call": 4 } }
}
```
