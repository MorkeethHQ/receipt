import { ReceiptAgent, ReceiptChain, AxlTransport, verifyChain, publicKeyToHex } from '../../packages/receipt-sdk/dist/index.js';

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function main() {
  console.log('=== R.E.C.E.I.P.T. AXL Receiver (Node B, port 9003) ===\n');

  // --- Connect to AXL node ---
  const transport = new AxlTransport({ baseUrl: 'http://127.0.0.1:9003' });
  let nodeInfo;
  try {
    nodeInfo = await transport.connect();
  } catch (err: any) {
    console.error('Failed to connect to AXL node:', err.message);
    console.error('Make sure the AXL binary is running: cd demo/axl/node-b && ../bin/axl-node -config node-config.json');
    process.exit(1);
  }

  console.log(`Node peer ID : ${nodeInfo.peerId}`);
  console.log(`Node pub key : ${nodeInfo.publicKey.slice(0, 24)}...`);

  // --- Discover peers ---
  const peers = await transport.discoverPeers();
  console.log(`Peers online : ${peers.length}`);

  // --- Wait for handoff ---
  console.log('\nWaiting for handoff via Gensyn AXL P2P (timeout: 60s)...\n');
  let handoff;
  try {
    handoff = await transport.waitForHandoff(60000);
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  }

  const { fromPeerId, bundle, senderPublicKey } = handoff;

  console.log(`Received handoff from peer: ${fromPeerId}`);
  console.log(`  Receipts     : ${bundle.receipts.length}`);
  console.log(`  Chain root   : ${bundle.chainRootHash.slice(0, 32)}...`);
  console.log(`  Agent ID     : ${bundle.agentId}`);
  console.log(`  Sender key   : ${senderPublicKey ? senderPublicKey.slice(0, 24) + '...' : '(not provided)'}`);

  // --- Verify chain root hash ---
  console.log('\n--- Chain Root Verification ---');
  const chain = ReceiptChain.fromReceipts(bundle.receipts);
  const computedRoot = chain.computeRootHash();
  const rootMatch = computedRoot === bundle.chainRootHash;

  console.log(`  Computed root : ${computedRoot.slice(0, 32)}...`);
  console.log(`  Expected root : ${bundle.chainRootHash.slice(0, 32)}...`);
  console.log(`  Root match    : ${rootMatch ? 'YES' : 'NO -- TAMPERED'}`);

  if (!rootMatch) {
    console.error('\nChain root mismatch -- refusing handoff.');
    console.error('The receipt chain has been tampered with in transit.');
    process.exit(1);
  }

  // --- Verify every receipt signature + hash links ---
  console.log('\n--- Receipt-by-Receipt Verification ---');

  if (!senderPublicKey) {
    console.error('\nNo sender public key provided -- cannot verify signatures.');
    console.error('The handoff bundle must include senderPublicKey for cryptographic verification.');
    process.exit(1);
  }

  const senderKeyBytes = hexToBytes(senderPublicKey);
  const results = verifyChain(bundle.receipts, senderKeyBytes);
  let allValid = true;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const receipt = bundle.receipts[i];
    const status = r.valid ? 'PASS' : 'FAIL';
    const detail = r.valid
      ? `sig=ok chain=ok time=ok`
      : r.error ?? 'unknown error';
    console.log(`  [${i}] ${status}  ${receipt.action.type.padEnd(10)}  ${r.receiptId.slice(0, 8)}...  ${detail}`);
    if (!r.valid) allValid = false;
  }

  if (!allValid) {
    console.error('\nCHAIN VERIFICATION FAILED');
    console.error('One or more receipts have invalid signatures or broken chain links.');
    console.error('Refusing handoff -- this is exactly what R.E.C.E.I.P.T. prevents.');

    const failures = results.filter((r) => !r.valid);
    console.error(`\nFailed receipts (${failures.length}):`);
    for (const f of failures) {
      console.error(`  - ${f.receiptId.slice(0, 8)}: ${f.error}`);
    }
    process.exit(1);
  }

  console.log(`\nAll ${results.length} receipts verified successfully.`);

  // --- Extend chain with Agent B work ---
  console.log('\n--- Agent B: Extending Chain ---');
  const agentB = ReceiptAgent.continueFrom(bundle.receipts);
  console.log(`Agent B ID : ${agentB.agentId}`);
  console.log(`Agent B key: ${publicKeyToHex(agentB.getPublicKey()).slice(0, 24)}...`);
  console.log('');

  // Step 1: Read the handoff data
  const rb1 = agentB.readFile('received-handoff.json', JSON.stringify({
    fromPeerId,
    agentId: bundle.agentId,
    receipts: bundle.receipts.length,
    transport: 'gensyn-axl-p2p',
  }));
  console.log(`[1/4] file_read   ${rb1.id.slice(0, 8)}...  Read handoff metadata`);

  // Step 2: LLM analysis of received work
  const rb2 = agentB.callLlm(
    'Review the research handoff. Is the recommendation to implement multi-chain anchoring sound?',
    'The recommendation is sound. With 1,247 verified receipts and 0 failures, the system has proven reliability on a single chain. Multi-chain anchoring adds redundancy and wider verifiability. Implementation priority: 0G Mainnet (already deployed) + Base Sepolia (low cost for testing).',
  );
  console.log(`[2/4] llm_call    ${rb2.id.slice(0, 8)}...  Reviewed research, validated recommendation`);

  // Step 3: Decision
  const rb3 = agentB.decide(
    'Research is thorough with quantitative backing. Multi-chain strategy aligns with existing deployments on 0G and Base Sepolia. No technical blockers identified.',
    'Accept recommendation. Begin multi-chain anchoring implementation starting with dual 0G+Base deployment.',
  );
  console.log(`[3/4] decision    ${rb3.id.slice(0, 8)}...  Accepted recommendation`);

  // Step 4: Output
  const rb4 = agentB.produceOutput('Implementation plan', JSON.stringify({
    plan: 'Multi-chain anchoring',
    chains: ['0G Mainnet (16661)', 'Base Sepolia (84532)'],
    status: 'approved',
    verified_handoff: true,
    received_from: bundle.agentId,
    transport: 'gensyn-axl-p2p',
    total_receipts_in_chain: agentB.getReceipts().length,
  }));
  console.log(`[4/4] output      ${rb4.id.slice(0, 8)}...  Implementation plan produced`);

  // --- Summary ---
  const allReceipts = agentB.getReceipts();
  const newRoot = agentB.getChain().computeRootHash();

  console.log(`\n--- Extended Chain Summary ---`);
  console.log(`  Agent A receipts : ${bundle.receipts.length}`);
  console.log(`  Agent B receipts : ${allReceipts.length - bundle.receipts.length}`);
  console.log(`  Total receipts   : ${allReceipts.length}`);
  console.log(`  New chain root   : ${newRoot.slice(0, 32)}...`);
  console.log(`  Transport        : Gensyn AXL P2P`);

  // --- Full chain printout ---
  console.log(`\n--- Full Receipt Chain ---`);
  for (let i = 0; i < allReceipts.length; i++) {
    const r = allReceipts[i];
    const owner = i < bundle.receipts.length ? 'A' : 'B';
    console.log(`  [${i}] Agent ${owner}  ${r.action.type.padEnd(10)}  id=${r.id.slice(0, 8)}  prev=${r.prevId ? r.prevId.slice(0, 8) : 'null    '}  sig=${r.signature.slice(0, 16)}...`);
  }

  console.log(JSON.stringify({
    received: true,
    verified: true,
    transport: 'gensyn-axl-p2p',
    fromPeerId,
    senderAgentId: bundle.agentId,
    receiverAgentId: agentB.agentId,
    agentAReceipts: bundle.receipts.length,
    agentBReceipts: allReceipts.length - bundle.receipts.length,
    totalReceipts: allReceipts.length,
    newRootHash: newRoot,
  }, null, 2));
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
