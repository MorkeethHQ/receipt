import { ReceiptAgent, createAxlClient } from '../../packages/receipt-sdk/dist/index.js';

async function main() {
  const axl = createAxlClient();

  console.error('=== AXL Sender: Getting topology ===');
  const topo = await axl.topology();
  console.error(`My peer ID: ${topo.peerId}`);
  console.error(`Connected peers: ${topo.peers.length}`);

  if (topo.peers.length === 0) {
    console.error('No peers found. Start the receiver first.');
    process.exit(1);
  }

  const targetPeer = topo.peers[0];
  console.error(`Sending to peer: ${targetPeer}`);

  const agent = new ReceiptAgent();
  agent.readFile('data.csv', 'id,name,value\n1,alpha,100\n2,beta,200');
  agent.callLlm('Analyze dataset', 'Dataset contains 2 records with numeric values');
  agent.produceOutput('Analysis complete', JSON.stringify({ rows: 2, avgValue: 150 }));

  const chain = agent.getChain();
  const bundle = chain.toHandoffBundle(agent.agentId);

  console.error(`\nSending handoff bundle (${bundle.receipts.length} receipts)...`);
  await axl.sendHandoff(targetPeer, bundle);
  console.error('✓ Handoff sent via AXL P2P');
  console.error(`Chain root: ${bundle.chainRootHash}`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
