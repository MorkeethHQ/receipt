import { ReceiptChain, verifyChain } from '@receipt/sdk';
import type { Receipt } from '@receipt/sdk';
import * as fs from 'fs';
import { banner, section, out, ok, fail, c, field, trunc, actionColor } from '../fmt.js';

interface InspectOptions {
  receipt?: string;
}

export async function inspect(file: string, options: InspectOptions) {
  if (!fs.existsSync(file)) {
    out(`  ${c.red('Error:')} File not found: ${file}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const receipts: Receipt[] = data.receipts ?? data;
  const publicKey: Uint8Array | null = data.publicKey ? new Uint8Array(data.publicKey) : null;

  if (options.receipt) {
    const receipt = receipts.find(
      (r) => r.id === options.receipt || r.id.startsWith(options.receipt!)
    );
    if (!receipt) {
      out(`  ${c.red('Error:')} Receipt not found: ${options.receipt}`);
      process.exit(1);
    }
    process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
    return;
  }

  out(banner('R.E.C.E.I.P.T. Chain Inspector'));

  // Verify if we have a public key
  let verifyResults: { valid: boolean; error?: string }[] | null = null;
  if (publicKey) {
    verifyResults = verifyChain(receipts, publicKey);
  }

  // Chain metadata
  const chain = ReceiptChain.fromReceipts(receipts);
  const rootHash = chain.computeRootHash();
  const agents = new Set(receipts.map((r) => r.agentId));
  const firstTs = receipts[0]?.timestamp ?? 0;
  const lastTs = receipts[receipts.length - 1]?.timestamp ?? 0;

  out(field('File',      file));
  out(field('Receipts',  `${receipts.length}`));
  out(field('Root hash', trunc(rootHash, 16)));
  out(field('Agents',    `${agents.size} (${[...agents].map((a) => trunc(a, 8)).join(', ')})`));
  out(field('Duration',  `${lastTs - firstTs}ms`));

  // Receipt details
  out(section('Receipts'));

  let prevAgent = '';
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i];
    const colorFn = actionColor(r.action.type);
    const verified = verifyResults ? verifyResults[i] : null;
    const status = verified ? (verified.valid ? ok : fail) : c.dim('?');
    const validLabel = verified
      ? (verified.valid ? 'valid' : c.red(verified.error ?? 'invalid'))
      : c.dim('no key');

    if (r.agentId !== prevAgent) {
      out(`\n  ${c.cyan(`── Agent ${trunc(r.agentId, 8)} ──`)}`);
      prevAgent = r.agentId;
    }

    out(`  ${status} Receipt #${i} ${colorFn(`[${r.action.type}]`)} ${c.dim('—')} ${validLabel}`);
    out(field('Agent',     trunc(r.agentId), 6));
    out(field('Input',     `sha256:${trunc(r.inputHash)}`, 6));
    out(field('Output',    `sha256:${trunc(r.outputHash)}`, 6));
    out(field('Signature', `ed25519:${trunc(r.signature)}`, 6));
    out(field('Timestamp', new Date(r.timestamp).toISOString(), 6));
    out(field('Chain',     `← prev:${r.prevId ? trunc(r.prevId, 8) : c.dim('genesis')}`, 6));
  }
  out('');
}
