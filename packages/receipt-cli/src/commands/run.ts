import { ReceiptAgent, verifyChain, hash } from '@receipt/sdk';
import * as fs from 'fs';
import { banner, section, out, ok, fail, warn, c, field, trunc, actionColor } from '../fmt.js';

interface RunOptions {
  task: string;
  output?: string;
  adversarial?: boolean;
}

export async function run(options: RunOptions) {
  const { task, output, adversarial } = options;

  out(banner('R.E.C.E.I.P.T. Agent Pipeline'));

  if (adversarial) {
    out(`  ${warn} ${c.red('ADVERSARIAL MODE — will tamper with receipt #2')}`);
  }
  out(field('Task', task));

  const agent = new ReceiptAgent();
  out(field('Agent', trunc(agent.agentId)));
  out('');

  const steps: { label: string; fn: () => void }[] = [
    { label: 'Reading project files',   fn: () => agent.readFile('project.md', task) },
    { label: 'Calling external API',    fn: () => agent.callApi('https://api.example.com/analyze', JSON.stringify({ status: 'ok', score: 0.95 })) },
    { label: 'Running LLM inference',   fn: () => agent.callLlm(`Analyze: ${task}`, `Analysis complete. The task "${task}" has been evaluated with high confidence.`) },
    { label: 'Making decision',         fn: () => agent.decide('Analysis supports proceeding', 'Execute recommended approach') },
    { label: 'Producing output',        fn: () => agent.produceOutput('Pipeline complete', JSON.stringify({ task, status: 'complete', confidence: 0.95 })) },
  ];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    out(`  ${c.gray(`[${i + 1}/${steps.length}]`)} ${step.label}...`);
    step.fn();
  }

  let receipts = agent.getReceipts();

  if (adversarial) {
    out(`\n  ${warn} ${c.red('Tampering with receipt #2 outputHash...')}`);
    receipts = receipts.map((r, i) =>
      i === 1 ? { ...r, outputHash: hash('fabricated') } : r
    );
  }

  // Verify
  out(section('Verification'));
  const pubKey = agent.getPublicKey();
  const results = verifyChain(adversarial ? receipts : agent.getReceipts(), pubKey);

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const receipt = (adversarial ? receipts : agent.getReceipts())[i];
    const status = r.valid ? ok : fail;
    const colorFn = actionColor(receipt.action.type);

    out(`  ${status} Receipt #${i} ${colorFn(`[${receipt.action.type}]`)} ${c.dim('—')} ${r.valid ? 'valid' : c.red(r.error ?? 'invalid')}`);
    out(field('Agent',     trunc(receipt.agentId), 6));
    out(field('Input',     `sha256:${trunc(receipt.inputHash)}`, 6));
    out(field('Output',    `sha256:${trunc(receipt.outputHash)}`, 6));
    out(field('Signature', `ed25519:${trunc(receipt.signature)}`, 6));
    out(field('Chain',     `← prev:${receipt.prevId ? trunc(receipt.prevId, 8) : c.dim('genesis')}`, 6));
  }

  const chain = agent.getChain();
  const rootHash = chain.computeRootHash();
  const allValid = results.every((r) => r.valid);

  out(section('Summary'));
  out(field('Receipts', `${receipts.length}`));
  out(field('Root hash', trunc(rootHash, 16)));
  out(field('Status', allValid ? c.green('all valid') : c.red('VERIFICATION FAILED')));
  out('');

  const result = {
    receipts: adversarial ? receipts : agent.getReceipts(),
    rootHash,
    agentId: agent.agentId,
    publicKey: Array.from(agent.getPublicKey()),
  };

  if (output) {
    fs.writeFileSync(output, JSON.stringify(result, null, 2));
    out(`  ${ok} Written to ${c.bold(output)}`);
  } else {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }
}
