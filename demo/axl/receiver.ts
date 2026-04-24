import { ReceiptAgent, ReceiptChain, createAxlClient } from '../../packages/receipt-sdk/dist/index.js';

async function main() {
  const axl = createAxlClient({ baseUrl: 'http://127.0.0.1:9003' });

  console.error('=== AXL Receiver: Waiting for handoff ===');
  const topo = await axl.topology();
  console.error(`My peer ID: ${topo.peerId}`);

  console.error('Listening for incoming handoffs...');
  const { fromPeerId, bundle } = await axl.waitForHandoff(60000);

  console.error(`\nReceived handoff from peer: ${fromPeerId}`);
  console.error(`Receipts: ${bundle.receipts.length}`);
  console.error(`Chain root: ${bundle.chainRootHash}`);

  const chain = ReceiptChain.fromReceipts(bundle.receipts);
  const computedRoot = chain.computeRootHash();
  const rootMatch = computedRoot === bundle.chainRootHash;

  console.error(`\nRoot hash verification: ${rootMatch ? '✓ MATCH' : '✗ MISMATCH'}`);

  if (rootMatch) {
    console.error('\n✓ Verified. Extending chain...');
    const agent = ReceiptAgent.continueFrom(bundle.receipts);
    agent.readFile('received-data.json', JSON.stringify(bundle));
    agent.produceOutput('Processing complete', 'Received and verified via AXL P2P');

    console.error(`Extended chain to ${agent.getReceipts().length} receipts`);
    console.error(`New root: ${agent.getChain().computeRootHash()}`);
  } else {
    console.error('\n✗ Chain root mismatch — data may have been tampered with in transit');
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
