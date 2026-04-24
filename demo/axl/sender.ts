import { ReceiptAgent, createAxlClient } from '../../packages/receipt-sdk/dist/index.js';

async function main() {
  const axl = createAxlClient({ baseUrl: 'http://127.0.0.1:9002' });

  console.error('=== AXL Sender (Node A, port 9002) ===');
  const topo = await axl.topology();
  console.error(`My peer ID: ${topo.peerId}`);
  console.error(`My public key: ${topo.publicKey}`);
  console.error(`Connected peers: ${topo.peers.length}`);

  if (topo.peers.length === 0) {
    console.error('No peers found. Start node B first.');
    process.exit(1);
  }

  const targetPeer = topo.peers[0];
  console.error(`Target peer: ${targetPeer.slice(0, 16)}...`);

  const agent = new ReceiptAgent();
  console.error(`\nAgent ID: ${agent.agentId}`);

  agent.readFile('data.csv', 'id,name,value\n1,alpha,100\n2,beta,200\n3,gamma,300');
  console.error('[1/3] Read data file');

  agent.callLlm('Analyze this dataset', 'Dataset contains 3 records with increasing numeric values. Mean: 200, range: 100-300.');
  console.error('[2/3] LLM analysis complete');

  agent.produceOutput('Analysis complete', JSON.stringify({ rows: 3, mean: 200, range: [100, 300] }));
  console.error('[3/3] Output produced');

  const chain = agent.getChain();
  const bundle = chain.toHandoffBundle(agent.agentId);

  console.error(`\nSending handoff bundle via AXL P2P...`);
  console.error(`  Receipts: ${bundle.receipts.length}`);
  console.error(`  Chain root: ${bundle.chainRootHash}`);

  await axl.sendHandoff(targetPeer, bundle);
  console.error('✓ Handoff sent successfully via Gensyn AXL');

  console.log(JSON.stringify({
    sent: true,
    peerId: topo.publicKey,
    targetPeer,
    receipts: bundle.receipts.length,
    chainRootHash: bundle.chainRootHash,
  }, null, 2));
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
