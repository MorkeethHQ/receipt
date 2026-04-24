import { ReceiptChain } from '@receipt/sdk';
import type { Receipt } from '@receipt/sdk';
import * as fs from 'fs';

interface InspectOptions {
  receipt?: string;
}

export async function inspect(file: string, options: InspectOptions) {
  if (!fs.existsSync(file)) {
    process.stderr.write(`\x1b[31mFile not found: ${file}\x1b[0m\n`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const receipts: Receipt[] = data.receipts ?? data;

  if (options.receipt) {
    const receipt = receipts.find((r) => r.id === options.receipt || r.id.startsWith(options.receipt!));
    if (!receipt) {
      process.stderr.write(`\x1b[31mReceipt not found: ${options.receipt}\x1b[0m\n`);
      process.exit(1);
    }
    process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
    return;
  }

  const chain = ReceiptChain.fromReceipts(receipts);

  process.stderr.write('\x1b[36m=== RECEIPT Chain Inspector ===\x1b[0m\n\n');
  process.stderr.write(`Receipts: ${receipts.length}\n`);
  process.stderr.write(`Root hash: ${chain.computeRootHash()}\n`);

  const agents = new Set(receipts.map((r) => r.agentId));
  process.stderr.write(`Agents: ${agents.size} (${[...agents].map((a) => a.slice(0, 8)).join(', ')})\n`);

  const firstTs = receipts[0].timestamp;
  const lastTs = receipts[receipts.length - 1].timestamp;
  process.stderr.write(`Duration: ${lastTs - firstTs}ms\n\n`);

  process.stderr.write('Timeline:\n');
  let prevAgent = '';
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i];
    if (r.agentId !== prevAgent) {
      process.stderr.write(`\n  \x1b[36m── Agent ${r.agentId.slice(0, 8)} ──\x1b[0m\n`);
      prevAgent = r.agentId;
    }

    const actionColor = {
      file_read: '\x1b[33m',
      api_call: '\x1b[35m',
      llm_call: '\x1b[36m',
      decision: '\x1b[32m',
      output: '\x1b[34m',
    }[r.action.type] ?? '\x1b[0m';

    process.stderr.write(`  ${actionColor}[${r.action.type}]\x1b[0m ${r.action.description}\n`);
    process.stderr.write(`    id: ${r.id.slice(0, 12)}... → prev: ${r.prevId?.slice(0, 12) ?? 'null'}\n`);
  }
  process.stderr.write('\n');
}
