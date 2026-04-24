import { ReceiptAgent } from '../../packages/receipt-sdk/dist/index.js';
import * as fs from 'fs';
import * as path from 'path';

const adversarial = process.argv.includes('--adversarial');

async function main() {
  console.error('=== RECEIPT: Researcher Agent ===');
  console.error(adversarial ? '⚠ ADVERSARIAL MODE' : '✓ Normal mode');

  const agent = new ReceiptAgent();

  const readmePath = path.join(process.cwd(), 'README.md');
  const readmeContent = fs.existsSync(readmePath)
    ? fs.readFileSync(readmePath, 'utf-8')
    : 'No README found';
  agent.readFile('README.md', readmeContent);
  console.error('[1/5] Read project README');

  agent.callApi('https://api.github.com/repos/receipt/stats', JSON.stringify({
    stars: 42, forks: 7, issues: 3,
  }));
  console.error('[2/5] Fetched repo stats');

  agent.callLlm(
    'Analyze this project and summarize key findings',
    'The RECEIPT project implements a proof layer for agent work using hash-linked receipts with ed25519 signatures. Key strengths: cryptographic verification, multi-agent handoff support, on-chain anchoring.',
  );
  console.error('[3/5] LLM analysis complete');

  agent.decide(
    'Project has strong cryptographic foundation but needs more documentation',
    'Recommend adding architecture diagrams and API reference docs',
  );
  console.error('[4/5] Decision recorded');

  agent.produceOutput(
    'Research report',
    JSON.stringify({
      project: 'RECEIPT',
      recommendation: 'Add documentation, expand test coverage',
      confidence: 0.92,
    }),
  );
  console.error('[5/5] Output produced');

  const receipts = agent.getReceipts();

  if (adversarial) {
    console.error('⚠ Tampering with receipt #2 output hash...');
    receipts[1] = { ...receipts[1], outputHash: 'deadbeef'.repeat(8) };
  }

  const chain = agent.getChain();
  const bundle = chain.toHandoffBundle(agent.agentId);

  if (adversarial) {
    bundle.receipts = receipts;
  }

  const handoff = {
    bundle,
    publicKey: Array.from(agent.getPublicKey()),
  };

  const outPath = '/tmp/receipt-handoff.json';
  fs.writeFileSync(outPath, JSON.stringify(handoff, null, 2));
  console.error(`\nHandoff written to ${outPath}`);
  console.error(`Chain root: ${bundle.chainRootHash}`);
  console.error(`Receipts: ${receipts.length}`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
