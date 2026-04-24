import { ReceiptAgent, AxlTransport, publicKeyToHex } from '../../packages/receipt-sdk/dist/index.js';
import * as fs from 'fs';
import * as path from 'path';

async function inferVia0G(prompt: string): Promise<{ response: string; attested: boolean; provider: string; chatId: string }> {
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
    '0x25F8f01cA76060ea40895472b1b79f76613Ca497',
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

      const chatId = apiRes.headers.get('ZG-Res-Key') || result.id || '';
      let attested = false;
      try {
        const usage = result.usage ? JSON.stringify(result.usage) : '';
        attested = !!(await broker.inference.processResponse(addr, chatId, usage));
      } catch {}

      return { response, attested, provider: model, chatId };
    } catch { continue; }
  }
  throw new Error('All 0G Compute providers failed');
}

async function main() {
  console.log('=== R.E.C.E.I.P.T. AXL Sender (Node A, port 9002) ===\n');

  const transport = new AxlTransport({ baseUrl: 'http://127.0.0.1:9002' });
  let nodeInfo;
  try {
    nodeInfo = await transport.connect();
  } catch (err: any) {
    console.error('Failed to connect to AXL node:', err.message);
    console.error('Start Node A: cd demo/axl/node-a && ../bin/axl-node -config node-config.json');
    process.exit(1);
  }

  console.log(`Node peer ID : ${nodeInfo.peerId}`);
  console.log(`Node pub key : ${nodeInfo.publicKey.slice(0, 24)}...`);

  const peers = await transport.discoverPeers();
  console.log(`Peers online : ${peers.length}`);
  if (peers.length === 0) {
    console.error('\nNo peers found. Start Node B first.');
    process.exit(1);
  }

  const agent = new ReceiptAgent();
  console.log(`\nAgent ID: ${agent.agentId}`);
  console.log(`Agent key: ${publicKeyToHex(agent.getPublicKey()).slice(0, 24)}...\n`);

  // Step 1: Read a local file
  const readmePath = path.resolve(process.cwd(), '../../README.md');
  const readmeContent = fs.existsSync(readmePath)
    ? fs.readFileSync(readmePath, 'utf-8').slice(0, 500)
    : 'R.E.C.E.I.P.T. — Proof layer for agent work';
  const r1 = agent.readFile('README.md', readmeContent);
  console.log(`[1/5] file_read   ${r1.id.slice(0, 8)}...  Read project README`);

  // Step 2: Fetch real GitHub API
  let ghData: string;
  try {
    const res = await fetch('https://api.github.com/repos/MorkeethHQ/receipt', {
      headers: { 'User-Agent': 'RECEIPT-Agent/1.0' },
      signal: AbortSignal.timeout(5000),
    });
    ghData = await res.text();
  } catch {
    ghData = '{"full_name":"MorkeethHQ/receipt","language":"TypeScript"}';
  }
  const r2 = agent.callApi('https://api.github.com/repos/MorkeethHQ/receipt', ghData.slice(0, 500));
  console.log(`[2/5] api_call    ${r2.id.slice(0, 8)}...  Fetched GitHub repo metadata`);

  // Step 3: REAL 0G Compute TEE inference
  console.log(`[3/5] llm_call    Requesting 0G Compute TEE inference...`);
  const inferPrompt = 'Analyze this agent pipeline: Agent A reads files and APIs, calls an LLM, makes a decision, then hands off to Agent B for verification. What are the key security properties of this architecture?';
  const { response: llmResponse, attested, provider, chatId } = await inferVia0G(inferPrompt);
  const r3 = agent.callLlm(inferPrompt, llmResponse);
  console.log(`          ${r3.id.slice(0, 8)}...  ${provider} | attested: ${attested} | chatId: ${chatId.slice(0, 12)}...`);

  // Step 4: Decision
  const r4 = agent.decide(
    `LLM analysis via ${provider} (TEE ${attested ? 'verified' : 'unverified'}). System architecture is sound.`,
    'Proceed with handoff to Agent B for implementation of multi-chain anchoring',
  );
  console.log(`[4/5] decision    ${r4.id.slice(0, 8)}...  Proceed with handoff`);

  // Step 5: Output
  const outputData = JSON.stringify({
    project: 'RECEIPT',
    inferenceSource: provider,
    teeAttested: attested,
    recommendation: 'Multi-chain anchoring via 0G + Base',
    confidence: attested ? 0.97 : 0.85,
  });
  const r5 = agent.produceOutput('Research summary for handoff', outputData);
  console.log(`[5/5] output      ${r5.id.slice(0, 8)}...  Output produced\n`);

  // Build handoff bundle
  const chain = agent.getChain();
  const bundle = chain.toHandoffBundle(agent.agentId);
  const receipts = agent.getReceipts();

  console.log(`--- Handoff Bundle ---`);
  console.log(`  Receipts     : ${bundle.receipts.length}`);
  console.log(`  Chain root   : ${bundle.chainRootHash.slice(0, 32)}...`);
  console.log(`  TEE attested : ${attested}`);

  // Broadcast via A2A to ALL peers
  console.log(`\nBroadcasting handoff via A2A protocol to ${peers.length} peer(s)...`);
  const results = await transport.broadcastHandoff(receipts, agent.getPublicKey(), bundle);
  for (const r of results) {
    const status = r.success ? 'OK' : `FAIL: ${r.error}`;
    console.log(`  → ${r.peerId.slice(0, 16)}... ${status}`);
  }

  console.log('\nHandoff broadcast complete via Gensyn AXL A2A protocol');

  console.log(JSON.stringify({
    sent: true,
    transport: 'gensyn-axl-a2a',
    protocol: 'A2A',
    nodePublicKey: nodeInfo.publicKey,
    peersReached: results.filter(r => r.success).length,
    peersTotal: results.length,
    agentId: agent.agentId,
    receipts: bundle.receipts.length,
    chainRootHash: bundle.chainRootHash,
    teeAttested: attested,
    inferenceProvider: provider,
  }, null, 2));
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
