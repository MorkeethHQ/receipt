import { verifyChain } from '@receipt/sdk';
import * as fs from 'fs';

export async function verify(file: string) {
  if (!fs.existsSync(file)) {
    process.stderr.write(`\x1b[31mFile not found: ${file}\x1b[0m\n`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const receipts = data.receipts ?? data;
  const publicKey = data.publicKey ? new Uint8Array(data.publicKey) : null;

  process.stderr.write('\x1b[36m=== RECEIPT Chain Verification ===\x1b[0m\n\n');
  process.stderr.write(`Receipts: ${receipts.length}\n`);

  if (!publicKey) {
    process.stderr.write('\x1b[33m⚠ No public key found — skipping signature verification\x1b[0m\n');
    process.stderr.write('Verifying chain linkage only...\n\n');

    let valid = true;
    for (let i = 0; i < receipts.length; i++) {
      const receipt = receipts[i];
      const expectedPrevId = i === 0 ? null : receipts[i - 1].id;
      const linkOk = receipt.prevId === expectedPrevId;
      if (!linkOk) valid = false;

      const status = linkOk ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
      process.stderr.write(`  ${status} [${i + 1}/${receipts.length}] ${receipt.action.type} — ${receipt.id.slice(0, 8)}...\n`);
    }

    process.stderr.write(valid ? '\n\x1b[32m✓ Chain linkage valid\x1b[0m\n' : '\n\x1b[31m✗ Chain linkage broken\x1b[0m\n');
    process.exit(valid ? 0 : 1);
  }

  const results = verifyChain(receipts, publicKey);
  let allValid = true;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.valid) allValid = false;

    const status = r.valid ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    process.stderr.write(`  ${status} [${i + 1}/${results.length}] ${receipts[i].action.type}`);

    if (!r.valid) {
      process.stderr.write(` — \x1b[31m${r.error}\x1b[0m`);
    }
    process.stderr.write('\n');
  }

  process.stderr.write(allValid
    ? '\n\x1b[32m✓ All receipts verified\x1b[0m\n'
    : '\n\x1b[31m✗ VERIFICATION FAILED\x1b[0m\n'
  );

  process.exit(allValid ? 0 : 1);
}
