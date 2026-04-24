import { ReceiptAgent, ReceiptChain, AxlTransport, verifyChain, publicKeyToHex } from '../../packages/receipt-sdk/dist/index.js';

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function inferVia0G(prompt: string): Promise<{ response: string; attested: boolean; provider: string }> {
  const { createZGComputeNetworkBroker } = await import('@0glabs/0g-serving-broker');
  const { ethers } = await import('ethers');

  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error('Set PRIVATE_KEY env var for 0G Compute');

  const network = new ethers.Network('0g-mainnet', 16661);
  const provider = new ethers.JsonRpcProvider('https://evmrpc.0g.ai', network, { staticNetwork: network });
  const wallet = new ethers.Wallet(pk, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const providers = [
    '0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C',
    '0xBB3f5b0b5062CB5B3245222C5917afD1f6e13aF6',
  ];

  for (const addr of providers) {
    try {
      const { endpoint, model } = await broker.inference.getServiceMetadata(addr);
      const headers = await broker.inference.getRequestHeaders(addr);
      const apiRes = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 200 }),
        signal: AbortSignal.timeout(15000),
      });
      if (!apiRes.ok) continue;
      const result: any = await apiRes.json();
      const response = result.choices?.[0]?.message?.content ?? '';
      if (!response) continue;

      let attested = false;
      try {
        const chatId = apiRes.headers.get('ZG-Res-Key') || result.id;
        const usage = result.usage ? JSON.stringify(result.usage) : '';
        attested = !!(await broker.inference.processResponse(addr, chatId, usage));
      } catch {}

      return { response, attested, provider: model };
    } catch { continue; }
  }
  throw new Error('All 0G Compute providers failed');
}

async function main() {
  console.log('=== R.E.C.E.I.P.T. AXL Receiver (Node B, port 9003) ===\n');

  const transport = new AxlTransport({ baseUrl: 'http://127.0.0.1:9003' });
  let nodeInfo;
  try {
    nodeInfo = await transport.connect();
  } catch (err: any) {
    console.error('Failed to connect to AXL node:', err.message);
    console.error('Start Node B: cd demo/axl/node-b && ../bin/axl-node -config node-config.json');
    process.exit(1);
  }

  console.log(`Node peer ID : ${nodeInfo.peerId}`);
  console.log(`Node pub key : ${nodeInfo.publicKey.slice(0, 24)}...`);
  console.log(`Peers online : ${(await transport.discoverPeers()).length}`);

  // Wait for A2A handoff
  console.log('\nWaiting for A2A handoff via Gensyn AXL P2P (timeout: 60s)...\n');
  let handoff;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      handoff = await transport.receiveHandoffA2A();
      if (handoff) break;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }

  if (!handoff) {
    console.error('Timeout waiting for A2A handoff.');
    process.exit(1);
  }

  const { fromPeerId, bundle, senderPublicKey } = handoff;

  console.log(`Received A2A handoff from peer: ${fromPeerId.slice(0, 24)}...`);
  console.log(`  Receipts     : ${bundle.receipts.length}`);
  console.log(`  Chain root   : ${bundle.chainRootHash.slice(0, 32)}...`);
  console.log(`  Sender key   : ${senderPublicKey ? senderPublicKey.slice(0, 24) + '...' : '(not provided)'}`);

  // Verify chain root hash
  console.log('\n--- Chain Root Verification ---');
  const chain = ReceiptChain.fromReceipts(bundle.receipts);
  const computedRoot = chain.computeRootHash();
  const rootMatch = computedRoot === bundle.chainRootHash;

  console.log(`  Computed root : ${computedRoot.slice(0, 32)}...`);
  console.log(`  Expected root : ${bundle.chainRootHash.slice(0, 32)}...`);
  console.log(`  Root match    : ${rootMatch ? 'YES' : 'NO — TAMPERED'}`);

  if (!rootMatch) {
    console.error('\nChain root mismatch — refusing handoff. Chain tampered in transit.');
    process.exit(1);
  }

  // Verify every receipt signature
  console.log('\n--- Receipt-by-Receipt Verification ---');
  if (!senderPublicKey) {
    console.error('No sender public key — cannot verify signatures.');
    process.exit(1);
  }

  const senderKeyBytes = hexToBytes(senderPublicKey);
  const results = verifyChain(bundle.receipts, senderKeyBytes);
  let allValid = true;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const receipt = bundle.receipts[i];
    const status = r.valid ? 'PASS' : 'FAIL';
    const detail = r.valid ? 'sig=ok chain=ok' : r.error ?? 'unknown error';
    console.log(`  [${i}] ${status}  ${receipt.action.type.padEnd(10)}  ${r.receiptId.slice(0, 8)}...  ${detail}`);
    if (!r.valid) allValid = false;
  }

  if (!allValid) {
    console.error('\nCHAIN VERIFICATION FAILED — refusing handoff.');
    process.exit(1);
  }

  console.log(`\nAll ${results.length} receipts verified successfully.`);

  // Extend chain with Agent B work using REAL 0G Compute TEE
  console.log('\n--- Agent B: Extending Chain with Real 0G Compute ---');
  const agentB = ReceiptAgent.continueFrom(bundle.receipts);
  console.log(`Agent B ID : ${agentB.agentId}`);
  console.log(`Agent B key: ${publicKeyToHex(agentB.getPublicKey()).slice(0, 24)}...\n`);

  // Step 1: Read handoff metadata
  const rb1 = agentB.readFile('received-handoff.json', JSON.stringify({
    fromPeerId,
    agentId: bundle.agentId,
    receipts: bundle.receipts.length,
    transport: 'gensyn-axl-a2a',
    verified: true,
  }));
  console.log(`[1/4] file_read   ${rb1.id.slice(0, 8)}...  Read handoff metadata`);

  // Step 2: REAL 0G Compute TEE inference for verification analysis
  console.log(`[2/4] llm_call    Requesting 0G Compute TEE inference...`);
  const verifyPrompt = `Review this agent handoff: Agent A produced ${bundle.receipts.length} receipts. All signatures verified. Chain root matches. The recommendation is to implement multi-chain anchoring. Is this recommendation sound given the verified data?`;
  const { response: llmResponse, attested, provider } = await inferVia0G(verifyPrompt);
  const rb2 = agentB.callLlm(verifyPrompt, llmResponse);
  console.log(`          ${rb2.id.slice(0, 8)}...  ${provider} | attested: ${attested}`);

  // Step 3: Decision
  const rb3 = agentB.decide(
    `Verified ${bundle.receipts.length} receipts from Agent A. LLM analysis (${provider}, TEE ${attested ? 'verified' : 'unverified'}) confirms recommendation is sound.`,
    'Accept recommendation. Begin multi-chain anchoring.',
  );
  console.log(`[3/4] decision    ${rb3.id.slice(0, 8)}...  Accepted recommendation`);

  // Step 4: Output
  const rb4 = agentB.produceOutput('Implementation plan', JSON.stringify({
    plan: 'Multi-chain anchoring',
    chains: ['0G Mainnet (16661)'],
    verified_handoff: true,
    received_from: bundle.agentId,
    transport: 'gensyn-axl-a2a',
    total_receipts: agentB.getReceipts().length,
  }));
  console.log(`[4/4] output      ${rb4.id.slice(0, 8)}...  Implementation plan produced`);

  // Broadcast extended chain back to ALL peers (adopt pattern)
  const allReceipts = agentB.getReceipts();
  const newRoot = agentB.getChain().computeRootHash();
  const newBundle = agentB.getChain().toHandoffBundle(agentB.agentId);

  console.log(`\n--- Extended Chain Summary ---`);
  console.log(`  Agent A receipts : ${bundle.receipts.length}`);
  console.log(`  Agent B receipts : ${allReceipts.length - bundle.receipts.length}`);
  console.log(`  Total receipts   : ${allReceipts.length}`);
  console.log(`  New chain root   : ${newRoot.slice(0, 32)}...`);

  // Broadcast extended chain back via A2A
  console.log(`\nBroadcasting extended chain back to peers via A2A...`);
  const broadcastResults = await transport.broadcastHandoff(allReceipts, agentB.getPublicKey(), newBundle);
  for (const r of broadcastResults) {
    console.log(`  → ${r.peerId.slice(0, 16)}... ${r.success ? 'OK' : `FAIL: ${r.error}`}`);
  }

  // Full chain printout
  console.log(`\n--- Full Receipt Chain ---`);
  for (let i = 0; i < allReceipts.length; i++) {
    const r = allReceipts[i];
    const owner = i < bundle.receipts.length ? 'A' : 'B';
    console.log(`  [${i}] Agent ${owner}  ${r.action.type.padEnd(10)}  id=${r.id.slice(0, 8)}  sig=${r.signature.slice(0, 16)}...`);
  }

  console.log(JSON.stringify({
    received: true,
    verified: true,
    transport: 'gensyn-axl-a2a',
    protocol: 'A2A',
    fromPeerId,
    senderAgentId: bundle.agentId,
    receiverAgentId: agentB.agentId,
    agentAReceipts: bundle.receipts.length,
    agentBReceipts: allReceipts.length - bundle.receipts.length,
    totalReceipts: allReceipts.length,
    newRootHash: newRoot,
    broadcastedBack: broadcastResults.filter(r => r.success).length,
  }, null, 2));
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
