import { ReceiptAgent, ReceiptChain, createAxlClient } from '../../packages/receipt-sdk/dist/index.js';

async function main() {
  const axl = createAxlClient({ baseUrl: 'http://127.0.0.1:9003' });

  console.error('=== AXL Receiver (Node B, port 9003) ===');
  const topo = await axl.topology();
  console.error(`My peer ID: ${topo.peerId}`);
  console.error(`My public key: ${topo.publicKey}`);
  console.error(`Connected peers: ${topo.peers.length}`);

  console.error('\nWaiting for handoff via AXL P2P...');
  const { fromPeerId, bundle } = await axl.waitForHandoff(60000);

  console.error(`\n✓ Received handoff from: ${fromPeerId}`);
  console.error(`  Receipts: ${bundle.receipts.length}`);
  console.error(`  Chain root: ${bundle.chainRootHash}`);
  console.error(`  Agent: ${bundle.agentId}`);

  console.error('\nVerifying chain integrity...');
  const chain = ReceiptChain.fromReceipts(bundle.receipts);
  const computedRoot = chain.computeRootHash();
  const rootMatch = computedRoot === bundle.chainRootHash;

  console.error(`  Computed root: ${computedRoot}`);
  console.error(`  Expected root: ${bundle.chainRootHash}`);
  console.error(`  Match: ${rootMatch ? '✓ YES' : '✗ NO — TAMPERED'}`);

  if (!rootMatch) {
    console.error('\n✗ Chain root mismatch — refusing handoff');
    process.exit(1);
  }

  console.error('\n✓ Chain verified. Extending with Agent B receipts...');
  const agentB = ReceiptAgent.continueFrom(bundle.receipts);

  agentB.readFile('received-handoff.json', JSON.stringify(bundle));
  console.error('[1/2] Read handoff data');

  agentB.produceOutput('Processing complete', JSON.stringify({
    verified: true,
    receivedFrom: fromPeerId,
    originalReceipts: bundle.receipts.length,
    transport: 'gensyn-axl-p2p',
  }));
  console.error('[2/2] Output produced');

  const allReceipts = agentB.getReceipts();
  const newRoot = agentB.getChain().computeRootHash();

  console.error(`\nExtended chain: ${allReceipts.length} total receipts`);
  console.error(`  Agent A: ${bundle.receipts.length} receipts`);
  console.error(`  Agent B: ${allReceipts.length - bundle.receipts.length} receipts`);
  console.error(`  New root: ${newRoot}`);

  console.log(JSON.stringify({
    received: true,
    fromPeerId,
    totalReceipts: allReceipts.length,
    newRootHash: newRoot,
    transport: 'gensyn-axl-p2p',
  }, null, 2));
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
