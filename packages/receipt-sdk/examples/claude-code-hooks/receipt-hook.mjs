#!/usr/bin/env node

/**
 * RECEIPT hook for Claude Code
 *
 * Creates a cryptographic receipt for every tool call Claude Code makes.
 * Chains are finalized per session and written to .receipt/chains/.
 *
 * Setup — add to .claude/settings.json:
 *
 *   {
 *     "hooks": {
 *       "PostToolUse": [{ "hooks": [{ "type": "command", "command": "node .receipt/receipt-hook.mjs", "async": true }] }],
 *       "SessionStart": [{ "hooks": [{ "type": "command", "command": "node .receipt/receipt-hook.mjs" }] }],
 *       "Stop": [{ "hooks": [{ "type": "command", "command": "node .receipt/receipt-hook.mjs" }] }]
 *     }
 *   }
 *
 * Or install globally:
 *   npm install -g agenticproof
 *   receipt init --claude-code
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { createHash, generateKeyPairSync, sign } from 'crypto';
import { join } from 'path';

const CHAIN_DIR = join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.receipt', 'chains');
const STATE_FILE = join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.receipt', 'active-session.json');

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function readStdin() {
  try {
    return JSON.parse(readFileSync('/dev/stdin', 'utf-8'));
  } catch {
    return {};
  }
}

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function saveState(state) {
  mkdirSync(join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.receipt'), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function newSession(sessionId) {
  return {
    sessionId,
    agentId: 'claude-code',
    startedAt: Date.now(),
    receipts: [],
    keyPair: null,
  };
}

function getOrCreateKeys(state) {
  if (state.keyPair) return state.keyPair;
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  state.keyPair = {
    public: publicKey.export({ type: 'spki', format: 'der' }).toString('hex'),
    private: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('hex'),
  };
  return state.keyPair;
}

function createReceipt(state, action, inputData, outputData) {
  const keys = getOrCreateKeys(state);
  const prevId = state.receipts.length > 0 ? state.receipts[state.receipts.length - 1].id : null;
  const timestamp = Date.now();
  const inputHash = sha256(typeof inputData === 'string' ? inputData : JSON.stringify(inputData));
  const outputHash = sha256(typeof outputData === 'string' ? outputData : JSON.stringify(outputData));
  const id = sha256(`${prevId || 'null'}:${state.agentId}:${timestamp}:${action.type}:${inputHash}:${outputHash}`);

  const payload = `${id}:${prevId || 'null'}:${state.agentId}:${timestamp}:${action.type}:${inputHash}:${outputHash}`;

  let signature = '';
  try {
    const privKey = Buffer.from(keys.private, 'hex');
    const keyObj = require('crypto').createPrivateKey({ key: privKey, format: 'der', type: 'pkcs8' });
    signature = require('crypto').sign(null, Buffer.from(payload), keyObj).toString('hex');
  } catch {
    signature = sha256(payload + ':unsigned');
  }

  const receipt = {
    id,
    prevId,
    agentId: state.agentId,
    timestamp,
    action,
    inputHash,
    outputHash,
    attestation: null,
    signature,
  };

  state.receipts.push(receipt);
  return receipt;
}

function finalizeChain(state) {
  if (!state || state.receipts.length === 0) return;

  mkdirSync(CHAIN_DIR, { recursive: true });

  const last = state.receipts[state.receipts.length - 1];
  const rootHash = sha256(`${last.id}:${last.inputHash}:${last.outputHash}:${last.signature}`);

  const chain = {
    runId: `claude-code-${state.sessionId}-${state.startedAt}`,
    sessionId: state.sessionId,
    agentId: state.agentId,
    receipts: state.receipts,
    rootHash,
    valid: true,
    publicKey: state.keyPair?.public || '',
    completedAt: Date.now(),
    durationMs: Date.now() - state.startedAt,
    stats: {
      total: state.receipts.length,
      byType: state.receipts.reduce((acc, r) => {
        acc[r.action.type] = (acc[r.action.type] || 0) + 1;
        return acc;
      }, {}),
    },
  };

  const filename = `${state.sessionId}-${Date.now()}.json`;
  writeFileSync(join(CHAIN_DIR, filename), JSON.stringify(chain, null, 2));

  // Clean up active session
  try { require('fs').unlinkSync(STATE_FILE); } catch {}

  return chain;
}

// ── Main ──────────────────────────────────────────────────────────

const event = readStdin();
const hookEvent = event.hook_event_name;

if (hookEvent === 'SessionStart') {
  const sessionId = event.session_id || `session-${Date.now()}`;
  saveState(newSession(sessionId));
  process.exit(0);
}

if (hookEvent === 'Stop') {
  const state = loadState();
  if (state) {
    const chain = finalizeChain(state);
    if (chain) {
      const output = JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'Stop',
          additionalContext: `[RECEIPT] Chain finalized: ${chain.stats.total} receipts, root hash ${chain.rootHash.slice(0, 16)}...`,
        },
      });
      process.stdout.write(output);
    }
  }
  process.exit(0);
}

if (hookEvent === 'PostToolUse') {
  let state = loadState();
  if (!state) {
    state = newSession(event.session_id || `session-${Date.now()}`);
  }

  const toolName = event.tool_name || 'unknown';
  const toolInput = event.tool_input || {};
  const toolResponse = event.tool_response || {};
  const durationMs = event.duration_ms || 0;

  // Map Claude Code tools to receipt action types
  let actionType = 'tool_call';
  if (toolName === 'Read') actionType = 'file_read';
  else if (toolName === 'Write' || toolName === 'Edit') actionType = 'output';
  else if (toolName === 'Bash') actionType = 'tool_call';
  else if (toolName === 'WebFetch' || toolName === 'WebSearch') actionType = 'api_call';
  else if (toolName === 'Agent') actionType = 'tool_call';

  // Build description
  let description = `${toolName}`;
  if (toolName === 'Read' && toolInput.file_path) description = `Read ${toolInput.file_path}`;
  else if (toolName === 'Write' && toolInput.file_path) description = `Write ${toolInput.file_path}`;
  else if (toolName === 'Edit' && toolInput.file_path) description = `Edit ${toolInput.file_path}`;
  else if (toolName === 'Bash' && toolInput.command) description = `Bash: ${toolInput.command.slice(0, 100)}`;
  else if (toolName === 'WebSearch') description = `Search: ${JSON.stringify(toolInput).slice(0, 100)}`;
  else if (toolName === 'Agent') description = `Agent: ${(toolInput.description || '').slice(0, 100)}`;

  createReceipt(
    state,
    {
      type: actionType,
      description,
      metadata: { tool: toolName, durationMs: String(durationMs) },
    },
    toolInput,
    toolResponse,
  );

  saveState(state);
  process.exit(0);
}

// Unknown event — ignore
process.exit(0);
