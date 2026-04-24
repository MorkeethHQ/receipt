import { ReceiptAgent, verifyChain } from '../../packages/receipt-sdk/dist/index.js';
import * as fs from 'fs';

async function main() {
  console.error('=== RECEIPT: Builder Agent ===');

  const handoffPath = '/tmp/receipt-handoff.json';
  if (!fs.existsSync(handoffPath)) {
    console.error('No handoff file found. Run researcher.ts first.');
    process.exit(1);
  }

  const handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf-8'));
  const publicKey = new Uint8Array(handoff.publicKey);
  const receipts = handoff.bundle.receipts;

  console.error(`Received ${receipts.length} receipts from Agent A`);
  console.error('Verifying chain...\n');

  const results = verifyChain(receipts, publicKey);
  let allValid = true;

  for (const result of results) {
    const status = result.valid ? '✓' : '✗';
    console.error(`  ${status} Receipt ${result.receiptId.slice(0, 8)}... ${result.valid ? 'valid' : result.error}`);
    if (!result.valid) allValid = false;
  }

  if (!allValid) {
    console.error('\n✗ CHAIN VERIFICATION FAILED');
    console.error('Refusing to continue — receipts have been tampered with.');
    console.error('This is exactly what RECEIPT prevents: fabricated agent work.');
    process.exit(1);
  }

  console.error('\n✓ All receipts verified. Extending chain...\n');

  const agent = ReceiptAgent.continueFrom(receipts);

  agent.readFile('research-output.json', JSON.stringify(handoff.bundle));
  console.error('[1/4] Read research handoff');

  agent.callLlm(
    'Based on the research, generate implementation plan',
    'Implementation plan: 1) Add JSDoc comments to all public APIs, 2) Create architecture.svg diagram, 3) Add integration test suite, 4) Write deployment guide',
  );
  console.error('[2/4] Generated implementation plan');

  agent.decide(
    'Implementation plan is comprehensive and addresses all research findings',
    'Proceeding with documentation-first approach',
  );
  console.error('[3/4] Decision recorded');

  agent.produceOutput(
    'Build complete',
    JSON.stringify({
      filesCreated: ['docs/architecture.svg', 'docs/api-reference.md'],
      testsAdded: 12,
      coverageIncrease: '+15%',
    }),
  );
  console.error('[4/4] Build output produced');

  const allReceipts = agent.getReceipts();
  console.error(`\nTotal chain length: ${allReceipts.length} receipts`);
  console.error(`  Agent A: ${receipts.length} receipts`);
  console.error(`  Agent B: ${allReceipts.length - receipts.length} receipts`);
  console.error(`Root hash: ${agent.getChain().computeRootHash()}`);

  console.log(JSON.stringify(allReceipts, null, 2));
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
