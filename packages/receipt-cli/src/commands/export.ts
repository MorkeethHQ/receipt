import { receiptsToTrainingData, trainingDataToJsonl } from '@receipt/sdk';
import type { Receipt } from '@receipt/sdk';
import * as fs from 'fs';
import { banner, out, ok, fail, c, field } from '../fmt.js';

interface ExportOptions {
  format: string;
  output?: string;
}

export async function exportCmd(file: string, options: ExportOptions) {
  if (!fs.existsSync(file)) {
    out(`  ${c.red('Error:')} File not found: ${file}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const receipts: Receipt[] = data.receipts ?? data;

  if (options.format !== 'jsonl') {
    out(`  ${fail} ${c.red(`Unsupported format: ${options.format}`)}`);
    out(`  Supported formats: jsonl`);
    process.exit(1);
  }

  out(banner('R.E.C.E.I.P.T. Export'));

  out(field('Source',  file));
  out(field('Format',  options.format));
  out(field('Receipts', `${receipts.length}`));
  out('');

  const examples = receiptsToTrainingData(receipts);
  const jsonl = trainingDataToJsonl(examples);

  // Stats by action type
  const byType: Record<string, number> = {};
  for (const r of receipts) {
    byType[r.action.type] = (byType[r.action.type] ?? 0) + 1;
  }

  out(`  ${c.gray('Training examples by type:')}`);
  for (const [type, count] of Object.entries(byType)) {
    out(`    ${c.dim(type.padEnd(12))} ${count}`);
  }
  out('');

  if (options.output) {
    fs.writeFileSync(options.output, jsonl + '\n');
    out(`  ${ok} Written ${examples.length} examples to ${c.bold(options.output)}`);
  } else {
    process.stdout.write(jsonl + '\n');
    out(`  ${ok} ${c.green(`Exported ${examples.length} training examples`)}`);
  }
  out('');
}
