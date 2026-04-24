import { ReceiptChain, anchorOnChain } from '@receipt/sdk';
import type { Receipt } from '@receipt/sdk';
import * as fs from 'fs';
import { banner, section, out, ok, warn, c, field, trunc } from '../fmt.js';

interface AnchorOptions {
  rpc: string;
  contract?: string;
}

export async function anchor(file: string, options: AnchorOptions) {
  if (!fs.existsSync(file)) {
    out(`  ${c.red('Error:')} File not found: ${file}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const receipts: Receipt[] = data.receipts ?? data;

  out(banner('R.E.C.E.I.P.T. On-Chain Anchor'));

  const chain = ReceiptChain.fromReceipts(receipts);
  const rootHash = chain.computeRootHash();

  out(field('File',      file));
  out(field('Receipts',  `${receipts.length}`));
  out(field('Root hash', trunc(rootHash, 16)));
  out('');

  const privateKey = process.env.PRIVATE_KEY;

  if (!privateKey) {
    // Simulated anchor
    out(`  ${warn} ${c.yellow('No PRIVATE_KEY env var — running simulated anchor')}`);
    out('');

    const fakeTxHash = `0x${rootHash.slice(0, 64)}`;
    const fakeBlock = Math.floor(Math.random() * 1000000) + 1000000;

    out(section('Simulated Transaction'));
    out(field('TX Hash',  trunc(fakeTxHash, 20)));
    out(field('Block',    `${fakeBlock}`));
    out(field('Chain ID', '16601'));
    out(field('Contract', options.contract ?? c.dim('not set')));
    out(field('Root',     `0x${trunc(rootHash, 16)}`));
    out('');
    out(`  ${ok} ${c.green('Simulated anchor complete')}`);
    out(`  ${c.dim('Set PRIVATE_KEY to anchor on 0G Newton testnet')}`);
    out('');
    return;
  }

  // Real anchor
  if (!options.contract) {
    out(`  ${c.red('Error:')} --contract address required for live anchoring`);
    process.exit(1);
  }

  out(`  ${c.cyan('Anchoring to 0G chain...')}`);

  try {
    const result = await anchorOnChain(rootHash, null, {
      rpc: options.rpc,
      contractAddress: options.contract,
      privateKey,
    });

    out(section('Transaction'));
    out(field('TX Hash',  result.txHash));
    out(field('Block',    `${result.blockNumber}`));
    out(field('Chain ID', `${result.chainId}`));
    out(field('Root',     result.rootHash));
    out('');
    out(`  ${ok} ${c.green('Anchored on-chain')}`);
    out('');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    out(`  ${c.red('Error:')} ${msg}`);
    process.exit(1);
  }
}
