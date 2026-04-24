import { ReceiptChain, anchorOnChain, storeChainOn0G } from '../../packages/receipt-sdk/dist/index.js';
import type { Receipt, AnchorConfig } from '../../packages/receipt-sdk/dist/index.js';

interface WebhookPayload {
  receipts: Receipt[];
  agentId: string;
}

const OG_MAINNET_CONFIG: AnchorConfig = {
  rpc: 'https://evmrpc.0g.ai',
  contractAddress: process.env.OG_CONTRACT_ADDRESS ?? '',
  privateKey: process.env.PRIVATE_KEY ?? '',
};

const BASE_SEPOLIA_CONFIG: AnchorConfig = {
  rpc: 'https://sepolia.base.org',
  contractAddress: process.env.BASE_CONTRACT_ADDRESS ?? '',
  privateKey: process.env.PRIVATE_KEY ?? '',
};

export async function handleWebhook(payload: WebhookPayload) {
  console.log('KeeperHub webhook received');
  console.log(`Processing ${payload.receipts.length} receipts from agent ${payload.agentId}`);

  const chain = ReceiptChain.fromReceipts(payload.receipts);
  const rootHash = chain.computeRootHash();
  console.log(`Chain root hash: ${rootHash}`);

  let storageRef: string | null = null;
  try {
    const storageResult = await storeChainOn0G(
      chain.serialize(),
      'https://indexer-storage-testnet-turbo.0g.ai',
      'https://evmrpc-testnet.0g.ai',
      process.env.PRIVATE_KEY ?? '',
    );
    storageRef = storageResult.rootHash || null;
    console.log(`0G Storage: ${storageResult.uploaded ? 'uploaded' : 'root computed'} — ${storageRef}`);
  } catch (err) {
    console.log('0G Storage: skipped (no funds or connection)');
  }

  const results = await Promise.allSettled([
    anchorOnChain(rootHash, storageRef, OG_MAINNET_CONFIG),
    anchorOnChain(rootHash, storageRef, BASE_SEPOLIA_CONFIG),
  ]);

  for (const [i, result] of results.entries()) {
    const chain = i === 0 ? '0G Mainnet' : 'Base Sepolia';
    if (result.status === 'fulfilled') {
      console.log(`✓ Anchored on ${chain}: tx ${result.value.txHash}`);
    } else {
      console.log(`✗ ${chain} anchor failed: ${result.reason}`);
    }
  }

  return { rootHash, storageRef, anchored: results.map((r) => r.status === 'fulfilled') };
}
