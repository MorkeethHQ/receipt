import { verifyChain, ReceiptChain } from '@receipt/sdk';
import type { Receipt } from '@receipt/sdk';
import * as fs from 'fs';
import { banner, section, out, ok, fail, warn, c, field, trunc, actionColor } from '../fmt.js';

export async function verify(file: string) {
  if (!fs.existsSync(file)) {
    out(`  ${c.red('Error:')} File not found: ${file}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const receipts: Receipt[] = data.receipts ?? data;
  const publicKey: Uint8Array | null = data.publicKey ? new Uint8Array(data.publicKey) : null;

  out(banner('R.E.C.E.I.P.T. Chain Verification'));

  out(field('File',     file));
  out(field('Receipts', `${receipts.length}`));
  out('');

  if (!publicKey) {
    out(`  ${warn} ${c.yellow('No public key in file — verifying chain linkage only')}`);
    out('');

    let valid = true;
    for (let i = 0; i < receipts.length; i++) {
      const receipt = receipts[i];
      const expectedPrevId = i === 0 ? null : receipts[i - 1].id;
      const linkOk = receipt.prevId === expectedPrevId;
      if (!linkOk) valid = false;

      const colorFn = actionColor(receipt.action.type);
      const status = linkOk ? ok : fail;
      const validLabel = linkOk ? 'valid' : c.red('broken chain link');

      out(`  ${status} Receipt #${i} ${colorFn(`[${receipt.action.type}]`)} ${c.dim('—')} ${validLabel}`);
      out(field('Agent',     trunc(receipt.agentId), 6));
      out(field('Input',     `sha256:${trunc(receipt.inputHash)}`, 6));
      out(field('Output',    `sha256:${trunc(receipt.outputHash)}`, 6));
      out(field('Signature', `ed25519:${trunc(receipt.signature)}`, 6));
      out(field('Chain',     `← prev:${receipt.prevId ? trunc(receipt.prevId, 8) : c.dim('genesis')}`, 6));
    }

    out(section('Result'));
    out(valid
      ? `  ${ok} ${c.green('Chain linkage valid')}`
      : `  ${fail} ${c.red('Chain linkage BROKEN')}`
    );
    out('');
    process.exit(valid ? 0 : 1);
  }

  // Full verification with signatures
  const results = verifyChain(receipts, publicKey);
  let allValid = true;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const receipt = receipts[i];
    if (!r.valid) allValid = false;

    const colorFn = actionColor(receipt.action.type);
    const status = r.valid ? ok : fail;
    const validLabel = r.valid ? 'valid' : c.red(r.error ?? 'invalid');

    out(`  ${status} Receipt #${i} ${colorFn(`[${receipt.action.type}]`)} ${c.dim('—')} ${validLabel}`);
    out(field('Agent',     trunc(receipt.agentId), 6));
    out(field('Input',     `sha256:${trunc(receipt.inputHash)}`, 6));
    out(field('Output',    `sha256:${trunc(receipt.outputHash)}`, 6));
    out(field('Signature', `ed25519:${trunc(receipt.signature)}`, 6));
    out(field('Chain',     `← prev:${receipt.prevId ? trunc(receipt.prevId, 8) : c.dim('genesis')}`, 6));
  }

  // Root hash
  const chain = ReceiptChain.fromReceipts(receipts);
  const rootHash = chain.computeRootHash();

  out(section('Result'));
  out(field('Root hash', trunc(rootHash, 16)));
  out(allValid
    ? `  ${ok} ${c.green('All receipts verified')}`
    : `  ${fail} ${c.red('VERIFICATION FAILED')}`
  );
  out('');

  process.exit(allValid ? 0 : 1);
}
