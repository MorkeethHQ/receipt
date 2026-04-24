import { ReceiptAgent, hash } from '@receipt/sdk';
import * as fs from 'fs';

interface RunOptions {
  task: string;
  output?: string;
  adversarial?: boolean;
}

export async function run(options: RunOptions) {
  const { task, output, adversarial } = options;

  process.stderr.write('\x1b[36m=== RECEIPT Agent Pipeline ===\x1b[0m\n');
  if (adversarial) process.stderr.write('\x1b[31m⚠ ADVERSARIAL MODE\x1b[0m\n');
  process.stderr.write(`Task: ${task}\n\n`);

  const agent = new ReceiptAgent();
  process.stderr.write(`Agent ID: ${agent.agentId}\n\n`);

  process.stderr.write('\x1b[33m[1/5]\x1b[0m Reading project files...\n');
  agent.readFile('project.md', task);

  process.stderr.write('\x1b[33m[2/5]\x1b[0m Calling external API...\n');
  agent.callApi('https://api.example.com/analyze', JSON.stringify({ status: 'ok', score: 0.95 }));

  process.stderr.write('\x1b[33m[3/5]\x1b[0m Running LLM inference...\n');
  agent.callLlm(`Analyze: ${task}`, `Analysis complete. The task "${task}" has been evaluated with high confidence.`);

  process.stderr.write('\x1b[33m[4/5]\x1b[0m Making decision...\n');
  agent.decide('Analysis supports proceeding', 'Execute recommended approach');

  process.stderr.write('\x1b[33m[5/5]\x1b[0m Producing output...\n');
  agent.produceOutput('Pipeline complete', JSON.stringify({ task, status: 'complete', confidence: 0.95 }));

  let receipts = agent.getReceipts();

  if (adversarial) {
    process.stderr.write('\n\x1b[31m⚠ Tampering with receipt #2...\x1b[0m\n');
    receipts = receipts.map((r, i) =>
      i === 1 ? { ...r, outputHash: hash('fabricated') } : r
    );
  }

  const chain = agent.getChain();
  const rootHash = chain.computeRootHash();

  process.stderr.write(`\n\x1b[32m✓ Chain complete\x1b[0m\n`);
  process.stderr.write(`  Receipts: ${receipts.length}\n`);
  process.stderr.write(`  Root hash: ${rootHash}\n`);

  const result = {
    receipts: adversarial ? receipts : agent.getReceipts(),
    rootHash,
    agentId: agent.agentId,
    publicKey: Array.from(agent.getPublicKey()),
  };

  if (output) {
    fs.writeFileSync(output, JSON.stringify(result, null, 2));
    process.stderr.write(`  Written to: ${output}\n`);
  } else {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }
}
