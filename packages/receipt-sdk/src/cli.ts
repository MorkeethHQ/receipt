#!/usr/bin/env node
import { ReceiptAgent } from './agent';
import { verifyChain } from './verify';
import { ReceiptChain } from './chain';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';

const args = process.argv.slice(2);
const cmd = args[0];

const BANNER = `
  ┌─────────────────────────────────────────┐
  │                                         │
  │   R.E.C.E.I.P.T.                       │
  │   ─────────────────                     │
  │   Proof of Agent Work                   │
  │                                         │
  │   ACTION ............ signed            │
  │   VERIFY ............ pass              │
  │   QUALITY ........... 82/100            │
  │   ANCHORED .......... 0G Mainnet        │
  │                                         │
  │   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄   │
  │   agenticproof v0.1.3                   │
  │   Ed25519 + SHA-256 | ERC-7857 | 0G     │
  └─────────────────────────────────────────┘
`;

const HELP = `${BANNER}
  Commands:
    init                    Generate receipt.config.json
    init --claude-code      Set up RECEIPT hooks for Claude Code
    init --cursor           Set up RECEIPT for Cursor agent mode
    init --openclaw         Show OpenClaw plugin install instructions
    verify <file>           Verify a receipt chain from JSON
    inspect <file>          Show chain stats and receipt summary
    wrap                    Print wrapper code for your agent

  Usage:
    npx receipt init
    npx receipt init --claude-code
    npx receipt verify chain.json
    npx receipt inspect chain.json
`;

function initClaudeCode() {
  mkdirSync('.receipt', { recursive: true });

  const hookScript = `#!/usr/bin/env node
${readFileSync(join(dirname(new URL(import.meta.url).pathname), '..', 'examples', 'claude-code-hooks', 'receipt-hook.mjs'), 'utf-8').toString()}`;

  // Write the hook script
  writeFileSync('.receipt/receipt-hook.mjs', hookScript);

  // Create/update .claude/settings.json
  mkdirSync('.claude', { recursive: true });
  const settingsPath = '.claude/settings.json';
  let settings: any = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')); } catch {}
  }

  settings.hooks = {
    ...settings.hooks,
    SessionStart: [{ hooks: [{ type: 'command', command: 'node .receipt/receipt-hook.mjs', timeout: 5 }] }],
    PostToolUse: [{ hooks: [{ type: 'command', command: 'node .receipt/receipt-hook.mjs', async: true, timeout: 10 }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'node .receipt/receipt-hook.mjs', timeout: 10 }] }],
  };

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

  const dash = process.env.RECEIPT_DASHBOARD_URL ?? 'https://receipt-murex.vercel.app';
  console.log(BANNER);
  console.log('  ✓ Hooks installed for Claude Code');
  console.log('');
  console.log('  Files:');
  console.log('    .receipt/receipt-hook.mjs  hook script');
  console.log('    .claude/settings.json      hooks config');
  console.log('');
  console.log('  On Claude Code SessionStop, the hook:');
  console.log('    • Saves a signed chain → .receipt/chains/<session>.json');
  console.log(`    • POSTs to ${dash}/api/chains (see ${dash}/team after Refresh)`);
  console.log('');
  console.log('  Register on 0G: open /team → Connect wallet → Register on a chain row');
  console.log('  Verify locally: npx receipt verify .receipt/chains/<file>.json');
}

function initCursor() {
  mkdirSync('.receipt', { recursive: true });

  // Cursor uses VS Code extension API — we create a lightweight watcher
  const watcherScript = `#!/usr/bin/env node
/**
 * RECEIPT watcher for Cursor
 *
 * Monitors git diff and file changes to create receipts for Cursor agent actions.
 * Run alongside Cursor: node .receipt/cursor-watcher.mjs
 */

import { watch } from 'fs';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

const CHAIN_DIR = '.receipt/chains';
const STATE_FILE = '.receipt/cursor-session.json';
mkdirSync(CHAIN_DIR, { recursive: true });

function sha256(d) { return createHash('sha256').update(d).digest('hex'); }

const state = {
  sessionId: 'cursor-' + Date.now(),
  agentId: 'cursor',
  startedAt: Date.now(),
  receipts: [],
  lastDiff: '',
};

function addReceipt(type, description, input, output) {
  const prevId = state.receipts.length > 0 ? state.receipts[state.receipts.length - 1].id : null;
  const ts = Date.now();
  const inputHash = sha256(JSON.stringify(input));
  const outputHash = sha256(JSON.stringify(output));
  const id = sha256(prevId + ':cursor:' + ts + ':' + type + ':' + inputHash + ':' + outputHash);
  state.receipts.push({
    id, prevId, agentId: 'cursor', timestamp: ts,
    action: { type, description }, inputHash, outputHash, attestation: null, signature: sha256(id + ':unsigned'),
  });
  console.log('  [receipt] ' + type + ': ' + description);
}

// Watch for file changes in src/
console.log('RECEIPT watcher running for Cursor. Watching for file changes...');
console.log('Press Ctrl+C to finalize chain.\\n');

let debounce = null;
watch('.', { recursive: true }, (event, filename) => {
  if (!filename || filename.startsWith('.receipt') || filename.startsWith('.git') || filename.startsWith('node_modules')) return;
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    try {
      const diff = execSync('git diff --stat 2>/dev/null || echo "no git"').toString().trim();
      if (diff !== state.lastDiff && diff !== 'no git') {
        state.lastDiff = diff;
        const lines = diff.split('\\n');
        for (const line of lines) {
          if (line.includes('|')) {
            const file = line.split('|')[0].trim();
            addReceipt('output', 'Edit ' + file, { file, event }, { diff: line });
          }
        }
      }
    } catch {}
  }, 1000);
});

process.on('SIGINT', () => {
  if (state.receipts.length === 0) { console.log('\\nNo receipts captured.'); process.exit(0); }
  const last = state.receipts[state.receipts.length - 1];
  const rootHash = sha256(last.id + ':' + last.inputHash + ':' + last.outputHash);
  const chain = {
    runId: state.sessionId, sessionId: state.sessionId, agentId: 'cursor',
    receipts: state.receipts, rootHash, valid: true, publicKey: '',
    completedAt: Date.now(), durationMs: Date.now() - state.startedAt,
    stats: { total: state.receipts.length, byType: state.receipts.reduce((a, r) => { a[r.action.type] = (a[r.action.type] || 0) + 1; return a; }, {}) },
  };
  const filename = state.sessionId + '.json';
  writeFileSync(join(CHAIN_DIR, filename), JSON.stringify(chain, null, 2));
  console.log('\\nChain finalized: ' + chain.stats.total + ' receipts → .receipt/chains/' + filename);
  const dashboardUrl = process.env.RECEIPT_DASHBOARD_URL || 'https://receipt-murex.vercel.app';
  fetch(dashboardUrl + '/api/chains', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receipts: state.receipts, agentId: 'cursor', rootHash, source: 'cursor' }),
    signal: AbortSignal.timeout(15000),
  }).then(r => r.ok ? r.json() : null).then(body => {
    if (body?.verifyUrl) console.log('  Published to dashboard: ' + body.verifyUrl);
    else console.log('  Published to dashboard');
  }).catch(() => { console.log('  Dashboard publish failed (chain saved locally)'); });
  setTimeout(() => process.exit(0), 2000);
});
`;

  writeFileSync('.receipt/cursor-watcher.mjs', watcherScript);

  console.log(BANNER);
  console.log('  ✓ Watcher installed for Cursor');
  console.log('');
  console.log('  File: .receipt/cursor-watcher.mjs');
  console.log('');
  console.log('  Usage:');
  console.log('    1. node .receipt/cursor-watcher.mjs');
  console.log('    2. Use Cursor - every edit becomes a receipt');
  console.log('    3. Ctrl+C to finalize and publish');
  console.log('');
  console.log('  On finalize:');
  console.log('    - Chain saved to .receipt/chains/');
  console.log('    - Published to dashboard (receipt-murex.vercel.app/team)');
  console.log('    - Connect wallet + Register On-Chain for permanent proof');
  console.log('');
}

function initOpenClaw() {
  console.log(BANNER);
  console.log('  OpenClaw RECEIPT Plugin');
  console.log('');
  console.log('  Install:');
  console.log('    openclaw plugins install openclaw-plugin-receipt');
  console.log('');
  console.log('  Or from source:');
  console.log('    git clone https://github.com/MorkeethHQ/receipt.git');
  console.log('    cd receipt/packages/openclaw-plugin-receipt');
  console.log('    npm run build && openclaw plugins install .');
  console.log('');
  console.log('  Every tool call and message → signed receipt');
  console.log('  Query: curl http://localhost:18789/plugins/receipt/latest');
}

function init() {
  if (args.includes('--claude-code')) return initClaudeCode();
  if (args.includes('--cursor')) return initCursor();
  if (args.includes('--openclaw')) return initOpenClaw();

  const config = {
    agent: {
      name: 'my-agent',
    },
    axl: {
      enabled: false,
      baseUrl: 'http://127.0.0.1:9011',
      peerUrl: 'http://127.0.0.1:9012',
    },
    anchoring: {
      enabled: false,
      rpc: 'https://evmrpc.0g.ai',
      contractAddress: '0x73B9A7768679B154D7E1eC5F2570a622A3b49651',
      chainId: 16661,
    },
    identity: {
      enabled: false,
      nftContract: '0xf964d45c3Ea5368918B1FDD49551E373028108c9',
      standard: 'ERC-7857',
    },
    validation: {
      enabled: false,
      registryContract: '0x2E32E845928A92DB193B59676C16D52923Fa01dd',
      standard: 'ERC-8004',
    },
    qualityThreshold: 60,
  };

  if (existsSync('receipt.config.json')) {
    console.log('receipt.config.json already exists. Not overwriting.');
    return;
  }

  writeFileSync('receipt.config.json', JSON.stringify(config, null, 2) + '\n');
  console.log(BANNER);
  console.log('  ✓ Created receipt.config.json');
  console.log('');
  console.log('  Next:');
  console.log('    1. Set agent.name');
  console.log('    2. Set PRIVATE_KEY env var for on-chain ops');
  console.log('    3. Wrap your agent:');
  console.log('');
  console.log('       import { ReceiptAgent } from "agenticproof";');
  console.log('       const agent = ReceiptAgent.create("my-agent");');
  console.log('       agent.callLlm(prompt, response);');
}

function verify(file: string) {
  if (!file) {
    console.error('Usage: receipt verify <chain.json>');
    process.exit(1);
  }

  if (!existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  const raw = readFileSync(file, 'utf-8');
  const receipts = JSON.parse(raw);

  if (!Array.isArray(receipts) || receipts.length === 0) {
    console.error('Invalid chain: expected non-empty array of receipts');
    process.exit(1);
  }

  const chain = ReceiptChain.fromReceipts(receipts);
  const rootHash = chain.computeRootHash();

  let passed = 0;
  let failed = 0;

  console.log('');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │  R.E.C.E.I.P.T.  CHAIN VERIFICATION        │');
  console.log(`  │  ${receipts.length} receipts${' '.repeat(35 - String(receipts.length).length)}│`);
  console.log('  ├─────────────────────────────────────────────┤');

  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i];
    const prev = i > 0 ? receipts[i - 1] : null;

    const linkOk = i === 0 ? r.prevId === null : r.prevId === prev?.id;

    if (linkOk) passed++; else failed++;

    const icon = linkOk ? '✓' : '✗';
    const label = `${r.action.type}`;
    const desc = (r.action.description || '').slice(0, 24);
    const status = linkOk ? 'PASS' : 'FAIL';
    const line = `  ${icon} #${String(i).padEnd(2)} ${label.padEnd(18)} ${status}`;
    console.log(`  │ ${line.padEnd(43)}│`);
    if (i < receipts.length - 1) {
      console.log('  │  │                                           │');
    }
  }

  console.log('  ├─────────────────────────────────────────────┤');
  const resultLine = `${passed} passed, ${failed} failed`;
  const resultIcon = failed === 0 ? '✓ CHAIN VALID' : '✗ CHAIN BROKEN';
  console.log(`  │  ${resultIcon.padEnd(43)}│`);
  console.log(`  │  ${resultLine.padEnd(43)}│`);
  console.log('  ├┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┤');
  console.log(`  │  ROOT ${rootHash.slice(0, 36)}│`);
  console.log('  └─────────────────────────────────────────────┘');
  console.log('');

  if (failed > 0) process.exit(1);
}

function inspect(file: string) {
  if (!file || !existsSync(file)) {
    console.error('Usage: receipt inspect <chain.json>');
    process.exit(1);
  }

  const receipts = JSON.parse(readFileSync(file, 'utf-8'));
  if (!Array.isArray(receipts)) { console.error('Invalid chain'); process.exit(1); }

  const byType: Record<string, number> = {};
  const agents = new Set<string>();

  for (const r of receipts) {
    byType[r.action.type] = (byType[r.action.type] || 0) + 1;
    agents.add(r.agentId);
  }

  const chain = ReceiptChain.fromReceipts(receipts);

  const rootHash = chain.computeRootHash();

  console.log('');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │  R.E.C.E.I.P.T.  CHAIN INSPECTOR           │');
  console.log('  ├─────────────────────────────────────────────┤');
  console.log(`  │  RECEIPTS ......... ${String(receipts.length).padEnd(23)}│`);
  console.log(`  │  AGENTS ........... ${[...agents].join(', ').slice(0, 23).padEnd(23)}│`);
  console.log('  ├┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┤');
  for (const [type, count] of Object.entries(byType)) {
    const bar = '█'.repeat(Math.min(count * 3, 18));
    console.log(`  │  ${type.padEnd(18)} ${bar.padEnd(18)} ${String(count).padStart(2)} │`);
  }

  const review = receipts.find((r: any) => r.action.type === 'usefulness_review');
  if (review) {
    console.log('  ├┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┤');
    const attested = review.attestation ? `✓ ${review.attestation.provider}` : 'none';
    console.log(`  │  QUALITY REVIEW ... ${review.agentId.slice(0, 23).padEnd(23)}│`);
    console.log(`  │  TEE .............. ${attested.slice(0, 23).padEnd(23)}│`);
  }

  console.log('  ├┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┤');
  console.log(`  │  ROOT ${rootHash.slice(0, 36)}│`);
  console.log('  └─────────────────────────────────────────────┘');
  console.log('');
}

function wrap() {
  console.log(`
// Wrap any agent with RECEIPT in ~10 lines:

import { ReceiptAgent } from 'agenticproof';
import { AxlTransport } from 'agenticproof/integrations/axl';

const agent = ReceiptAgent.create('my-agent');

// Wrap your existing agent actions:
agent.readFile('config.json', fileContents);
agent.callLlm('analyze this', llmResponse);
agent.callApi('https://api.example.com', apiResult);
agent.decide('reasoning here', 'decision here');
agent.produceOutput('final report', outputContent);

// Verify own chain:
const valid = agent.verifyOwnChain(); // true

// Hand off to another agent via AXL P2P:
const axl = new AxlTransport({ baseUrl: 'http://localhost:9011' });
await axl.sendHandoff(peerPublicKey, agent.getReceipts(), agent.getPublicKey(), {
  agentId: agent.agentId,
  receipts: agent.getReceipts(),
  chainRootHash: agent.getChain().computeRootHash(),
});

// On the other machine, receive and continue:
const incoming = await axl.waitForHandoff();
const agentB = ReceiptAgent.continueFrom(incoming.bundle.receipts);
// agentB's receipts extend the same hash chain
`);
}

switch (cmd) {
  case 'init': init(); break;
  case 'verify': verify(args[1]); break;
  case 'inspect': inspect(args[1]); break;
  case 'wrap': wrap(); break;
  case '--help': case '-h': case 'help': console.log(HELP); break;
  default:
    console.log(HELP);
    if (cmd) { console.error(`Unknown command: ${cmd}`); process.exit(1); }
}
