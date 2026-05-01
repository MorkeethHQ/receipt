#!/usr/bin/env npx tsx
/**
 * generate-claude-chains.ts
 *
 * Generates realistic Claude Code receipt chains and saves them to ~/.receipt/chains/.
 * Each chain simulates a real Claude Code session with file reads, tool calls,
 * LLM inference, decisions, and outputs, ending with a usefulness_review.
 *
 * Usage: npx tsx scripts/generate-claude-chains.ts
 */

import { randomUUID, createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Types (mirrors receipt-sdk but kept self-contained)
// ---------------------------------------------------------------------------

type ActionType =
  | "file_read"
  | "tool_call"
  | "llm_call"
  | "decision"
  | "output"
  | "usefulness_review";

interface ReceiptAction {
  type: ActionType;
  description: string;
  metadata?: Record<string, unknown>;
}

interface Receipt {
  id: string;
  agentId: string;
  timestamp: number;
  action: ReceiptAction;
  inputHash: string;
  outputHash: string;
  previousReceiptId: string | null;
  signature: string;
}

interface ChainFile {
  sessionId: string;
  rootHash: string;
  receipts: Receipt[];
  completedAt: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function fakeSignature(): string {
  return randomBytes(64).toString("base64");
}

/** Return a realistic inter-receipt delay in ms (20s to 4min). */
function receiptGap(): number {
  return Math.floor(20_000 + Math.random() * 220_000);
}

function buildReceipt(
  action: ReceiptAction,
  ts: number,
  prevId: string | null,
): Receipt {
  const id = randomUUID();
  const inputPayload = `${action.type}:${action.description}:${ts}:${prevId ?? "root"}`;
  const outputPayload = `${id}:${action.description}:result`;
  return {
    id,
    agentId: "claude-code-hooks",
    timestamp: ts,
    action,
    inputHash: sha256(inputPayload),
    outputHash: sha256(outputPayload),
    previousReceiptId: prevId,
    signature: fakeSignature(),
  };
}

function buildChain(
  steps: ReceiptAction[],
  startTs: number,
): { receipts: Receipt[]; endTs: number } {
  const receipts: Receipt[] = [];
  let ts = startTs;
  let prevId: string | null = null;

  for (const step of steps) {
    const r = buildReceipt(step, ts, prevId);
    receipts.push(r);
    prevId = r.id;
    ts += receiptGap();
  }

  return { receipts, endTs: ts };
}

function computeRootHash(receipts: Receipt[]): string {
  const concat = receipts.map((r) => r.outputHash).join("");
  return sha256(concat);
}

function usefulnessAction(
  alignment: number,
  substance: number,
  quality: number,
): ReceiptAction {
  const composite = Math.round(((alignment + substance + quality) / 3) * 100) / 100;
  return {
    type: "usefulness_review",
    description: JSON.stringify({ alignment, substance, quality, composite }),
  };
}

// ---------------------------------------------------------------------------
// Chain definitions
// ---------------------------------------------------------------------------

const now = Date.now();

// Chain 1: Fix failing test (8 receipts) -- started ~110min ago
const chain1Steps: ReceiptAction[] = [
  { type: "file_read", description: "Read package.json" },
  { type: "tool_call", description: "Run npm test" },
  { type: "llm_call", description: "Analyze test failure: TypeError in formatCurrency util" },
  { type: "file_read", description: "Read src/utils/formatCurrency.ts" },
  { type: "file_read", description: "Read tests/utils/formatCurrency.test.ts" },
  { type: "decision", description: "Apply edit to src/utils/formatCurrency.ts -- handle null input with early return" },
  { type: "tool_call", description: "Run npm test -- tests/utils/formatCurrency.test.ts" },
  usefulnessAction(9, 8, 8),
];

// Chain 2: Refactor API endpoint (10 receipts) -- started ~85min ago
const chain2Steps: ReceiptAction[] = [
  { type: "file_read", description: "Read src/routes/api/users.ts" },
  { type: "file_read", description: "Read src/middleware/auth.ts" },
  { type: "llm_call", description: "Analyze codebase structure for user API refactor" },
  { type: "decision", description: "Extract validation logic into src/validators/userSchema.ts" },
  { type: "file_read", description: "Read src/types/User.ts" },
  { type: "tool_call", description: "Run npx tsc --noEmit" },
  { type: "decision", description: "Apply edit to src/routes/api/users.ts -- replace inline validation with userSchema import" },
  { type: "tool_call", description: "Run npm test -- tests/routes/api/users.test.ts" },
  { type: "output", description: "Complete task: refactored /api/users endpoint, extracted validation into userSchema.ts" },
  usefulnessAction(8, 9, 9),
];

// Chain 3: Add new feature (12 receipts) -- started ~55min ago
const chain3Steps: ReceiptAction[] = [
  { type: "llm_call", description: "Generate implementation plan for webhook retry system" },
  { type: "file_read", description: "Read src/services/webhookService.ts" },
  { type: "file_read", description: "Read src/config/defaults.ts" },
  { type: "decision", description: "Create new file src/services/webhookRetryQueue.ts" },
  { type: "tool_call", description: "Run npx tsc --noEmit" },
  { type: "file_read", description: "Read src/types/Webhook.ts" },
  { type: "decision", description: "Apply edit to src/types/Webhook.ts -- add RetryPolicy and RetryAttempt interfaces" },
  { type: "decision", description: "Create new file tests/services/webhookRetryQueue.test.ts" },
  { type: "tool_call", description: "Run npm test -- tests/services/webhookRetryQueue.test.ts" },
  { type: "tool_call", description: "Run git diff --stat" },
  { type: "output", description: "Complete task: implemented exponential-backoff webhook retry queue with max 5 attempts" },
  usefulnessAction(9, 10, 9),
];

// Chain 4: Code review and cleanup (6 receipts) -- started ~20min ago
const chain4Steps: ReceiptAction[] = [
  { type: "tool_call", description: "Run git diff HEAD~3 --stat" },
  { type: "file_read", description: "Read src/components/Dashboard.tsx" },
  { type: "llm_call", description: "Review Dashboard component for dead code and unused imports" },
  { type: "decision", description: "Apply edit to src/components/Dashboard.tsx -- remove 4 unused imports and 2 dead branches" },
  { type: "tool_call", description: "Run npx eslint src/components/Dashboard.tsx --fix" },
  usefulnessAction(7, 7, 8),
];

// ---------------------------------------------------------------------------
// Build and write chains
// ---------------------------------------------------------------------------

const OUTPUT_DIR = join(homedir(), ".receipt", "chains");
mkdirSync(OUTPUT_DIR, { recursive: true });

interface ChainDef {
  label: string;
  steps: ReceiptAction[];
  offsetMinutes: number; // how many minutes ago the chain started
}

const chainDefs: ChainDef[] = [
  { label: "fix-failing-test", steps: chain1Steps, offsetMinutes: 110 },
  { label: "refactor-api-endpoint", steps: chain2Steps, offsetMinutes: 85 },
  { label: "add-new-feature", steps: chain3Steps, offsetMinutes: 55 },
  { label: "code-review-cleanup", steps: chain4Steps, offsetMinutes: 20 },
];

const written: string[] = [];

for (const def of chainDefs) {
  const startTs = now - def.offsetMinutes * 60_000;
  const { receipts, endTs } = buildChain(def.steps, startTs);
  const rootHash = computeRootHash(receipts);

  const chainFile: ChainFile = {
    sessionId: `cc-${startTs}`,
    rootHash,
    receipts,
    completedAt: endTs,
  };

  const filename = `chain-${startTs}.json`;
  const filepath = join(OUTPUT_DIR, filename);
  writeFileSync(filepath, JSON.stringify(chainFile, null, 2) + "\n");
  written.push(filepath);

  console.log(
    `[+] ${def.label}: ${receipts.length} receipts, root ${rootHash.slice(0, 12)}... -> ${filename}`,
  );
}

console.log(`\nWrote ${written.length} chains to ${OUTPUT_DIR}`);
