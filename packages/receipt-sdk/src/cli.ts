#!/usr/bin/env node
import { ReceiptAgent } from './agent';
import { verifyChain } from './verify';
import { ReceiptChain } from './chain';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const args = process.argv.slice(2);
const cmd = args[0];

const HELP = `
receipt-sdk — Cryptographic proof layer for AI agent work

Commands:
  init              Generate a receipt.config.json template
  verify <file>     Verify a receipt chain from JSON file
  inspect <file>    Show chain stats and receipt summary
  wrap              Print wrapper code for your agent

Usage:
  npx receipt-sdk init
  npx receipt-sdk verify chain.json
  npx receipt-sdk inspect chain.json
  npx receipt-sdk wrap
`;

function init() {
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
  console.log('Created receipt.config.json');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Set agent.name to your agent\'s identifier');
  console.log('  2. Set PRIVATE_KEY env var for on-chain operations');
  console.log('  3. Enable axl for multi-machine agent handoff');
  console.log('  4. Import and wrap your agent:');
  console.log('');
  console.log('     import { ReceiptAgent } from "receipt-sdk";');
  console.log('     const agent = ReceiptAgent.create("my-agent");');
  console.log('     agent.callLlm(prompt, response);');
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

  console.log(`Verifying ${receipts.length} receipts...`);
  console.log('');

  const chain = ReceiptChain.fromReceipts(receipts);
  const rootHash = chain.computeRootHash();

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i];
    const prev = i > 0 ? receipts[i - 1] : null;

    const linkOk = i === 0 ? r.prevId === null : r.prevId === prev?.id;

    const status = linkOk ? 'PASS' : 'FAIL';
    if (linkOk) passed++; else failed++;

    const icon = linkOk ? '✓' : '✗';
    console.log(`  ${icon} #${i + 1} [${r.action.type}] ${r.action.description?.slice(0, 50) || ''} — ${status}`);
  }

  console.log('');
  console.log(`Chain: ${passed} passed, ${failed} failed`);
  console.log(`Root hash: ${rootHash}`);

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

  console.log(`Chain: ${receipts.length} receipts`);
  console.log(`Agents: ${[...agents].join(', ')}`);
  console.log(`Root hash: ${chain.computeRootHash()}`);
  console.log('');
  console.log('By type:');
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type}: ${count}`);
  }

  const review = receipts.find((r: any) => r.action.type === 'usefulness_review');
  if (review) {
    console.log('');
    console.log(`Usefulness review: present (agent: ${review.agentId})`);
    if (review.attestation) {
      console.log(`  TEE attested: ${review.attestation.provider} (${review.attestation.type})`);
    }
  }
}

function wrap() {
  console.log(`
// Wrap any agent with RECEIPT in ~10 lines:

import { ReceiptAgent } from 'receipt-sdk';
import { AxlTransport } from 'receipt-sdk/integrations/axl';

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
