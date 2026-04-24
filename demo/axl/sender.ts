import { ReceiptAgent, AxlTransport, publicKeyToHex } from '../../packages/receipt-sdk/dist/index.js';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('=== R.E.C.E.I.P.T. AXL Sender (Node A, port 9002) ===\n');

  // --- Connect to AXL node ---
  const transport = new AxlTransport({ baseUrl: 'http://127.0.0.1:9002' });
  let nodeInfo;
  try {
    nodeInfo = await transport.connect();
  } catch (err: any) {
    console.error('Failed to connect to AXL node:', err.message);
    console.error('Make sure the AXL binary is running: cd demo/axl/node-a && ../bin/axl-node -config node-config.json');
    process.exit(1);
  }

  console.log(`Node peer ID : ${nodeInfo.peerId}`);
  console.log(`Node pub key : ${nodeInfo.publicKey.slice(0, 24)}...`);

  // --- Discover peers ---
  const peers = await transport.discoverPeers();
  console.log(`Peers online : ${peers.length}`);
  if (peers.length === 0) {
    console.error('\nNo peers found. Start Node B first:');
    console.error('  cd demo/axl/node-b && ../bin/axl-node -config node-config.json');
    process.exit(1);
  }

  const targetPeer = peers[0];
  console.log(`Target peer  : ${targetPeer.slice(0, 24)}...`);

  // --- Create Agent A and do real work ---
  const agent = new ReceiptAgent();
  console.log(`\nAgent ID: ${agent.agentId}`);
  console.log(`Agent key: ${publicKeyToHex(agent.getPublicKey()).slice(0, 24)}...`);
  console.log('');

  // Step 1: Read a local file
  const readmePath = path.resolve(process.cwd(), '../../README.md');
  const readmeContent = fs.existsSync(readmePath)
    ? fs.readFileSync(readmePath, 'utf-8').slice(0, 500)
    : 'R.E.C.E.I.P.T. — Proof layer for agent work';
  const r1 = agent.readFile('README.md', readmeContent);
  console.log(`[1/5] file_read   ${r1.id.slice(0, 8)}...  Read project README (${readmeContent.length} chars)`);

  // Step 2: Call an API
  const apiResponse = JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
    metrics: { receipts_verified: 1247, agents_active: 3, uptime_hours: 72 },
  });
  const r2 = agent.callApi('https://receipt.dev/api/stats', apiResponse);
  console.log(`[2/5] api_call    ${r2.id.slice(0, 8)}...  Fetched platform stats`);

  // Step 3: LLM inference
  const r3 = agent.callLlm(
    'Analyze the project stats and README. What is the health of the RECEIPT system?',
    'The RECEIPT system is healthy: 1,247 receipts verified with 0 failures, 3 active agents, 72h uptime. The hash-linked receipt architecture provides strong integrity guarantees. Recommendation: scale to multi-chain anchoring.',
  );
  console.log(`[3/5] llm_call    ${r3.id.slice(0, 8)}...  LLM analysis complete`);

  // Step 4: Decision
  const r4 = agent.decide(
    'System is healthy with strong verification record. Multi-chain anchoring would increase trust surface. Cost/benefit is favorable.',
    'Proceed with handoff to Agent B for implementation of multi-chain anchoring',
  );
  console.log(`[4/5] decision    ${r4.id.slice(0, 8)}...  Decision: proceed with handoff`);

  // Step 5: Produce output
  const outputData = JSON.stringify({
    project: 'RECEIPT',
    analysis: 'System healthy, 1247 verified receipts, 0 failures',
    recommendation: 'Implement multi-chain anchoring',
    confidence: 0.94,
    handoffReason: 'Agent B specializes in smart contract deployment',
  });
  const r5 = agent.produceOutput('Research summary for handoff', outputData);
  console.log(`[5/5] output      ${r5.id.slice(0, 8)}...  Output produced`);

  // --- Build handoff bundle ---
  const chain = agent.getChain();
  const bundle = chain.toHandoffBundle(agent.agentId);
  const receipts = agent.getReceipts();

  console.log(`\n--- Handoff Bundle ---`);
  console.log(`  Receipts     : ${bundle.receipts.length}`);
  console.log(`  Chain root   : ${bundle.chainRootHash.slice(0, 32)}...`);
  console.log(`  Agent ID     : ${bundle.agentId}`);
  console.log(`  Timestamp    : ${new Date(bundle.timestamp).toISOString()}`);

  // --- Print receipt chain ---
  console.log(`\n--- Receipt Chain ---`);
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i];
    console.log(`  [${i}] ${r.action.type.padEnd(10)} id=${r.id.slice(0, 8)}  prev=${r.prevId ? r.prevId.slice(0, 8) : 'null    '}  sig=${r.signature.slice(0, 16)}...`);
  }

  // --- Send via AXL P2P ---
  console.log(`\nSending handoff bundle via Gensyn AXL P2P...`);
  await transport.sendHandoff(targetPeer, receipts, agent.getPublicKey(), bundle);
  console.log('Handoff sent successfully via Gensyn AXL');

  // --- Summary output ---
  console.log(JSON.stringify({
    sent: true,
    transport: 'gensyn-axl-p2p',
    nodePublicKey: nodeInfo.publicKey,
    targetPeer,
    agentId: agent.agentId,
    agentPublicKey: publicKeyToHex(agent.getPublicKey()),
    receipts: bundle.receipts.length,
    chainRootHash: bundle.chainRootHash,
  }, null, 2));
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
