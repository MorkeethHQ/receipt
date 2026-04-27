/**
 * Two-machine agent handoff via Gensyn AXL
 *
 * Machine A (VPS - e.g. your OpenClaw agent):
 *   AXL_ROLE=researcher AXL_PEER_KEY=<mac-peer-key> npx tsx examples/two-machine-handoff.ts
 *
 * Machine B (Mac - Builder agent):
 *   AXL_ROLE=builder npx tsx examples/two-machine-handoff.ts
 *
 * Prerequisites:
 *   - AXL node running on each machine (see demo/axl/README.md)
 *   - Both nodes discover each other via Yggdrasil mesh
 */

import { ReceiptAgent } from 'agenticproof';
import { AxlTransport } from 'agenticproof/integrations/axl';

const role = process.env.AXL_ROLE || 'researcher';
const axlUrl = process.env.AXL_URL || 'http://127.0.0.1:9011';
const peerKey = process.env.AXL_PEER_KEY || '';

const axl = new AxlTransport({ baseUrl: axlUrl });

async function runResearcher() {
  console.log('=== RESEARCHER (Machine A) ===');

  const agent = ReceiptAgent.create('researcher');

  // Your agent does its work — replace with real logic
  agent.readFile('contract.sol', 'pragma solidity ^0.8.0; ...');
  agent.callLlm('Review this Solidity contract for vulnerabilities', 'No critical issues found. Reentrancy guard present.');
  agent.callApi('https://evmrpc.0g.ai', '{"jsonrpc":"2.0","result":"0x4f1a2b"}');
  agent.decide('Contract is safe, chain is live', 'Proceed with deployment');
  agent.produceOutput('Research report', JSON.stringify({ safe: true, chain: '0G Mainnet' }));

  console.log(`Created ${agent.getReceipts().length} receipts`);
  console.log(`Chain valid: ${agent.verifyOwnChain()}`);

  // Discover peer
  const info = await axl.connect();
  console.log(`AXL node: ${info.peerId.slice(0, 20)}...`);
  console.log(`Peers: ${info.peers.length}`);

  const target = peerKey || info.peers[0];
  if (!target) {
    console.error('No peer found. Set AXL_PEER_KEY or wait for peer discovery.');
    process.exit(1);
  }

  // Hand off the chain via AXL P2P
  console.log(`Sending ${agent.getReceipts().length} receipts to ${target.slice(0, 16)}...`);
  await axl.sendHandoff(target, agent.getReceipts(), agent.getPublicKey(), {
    agentId: agent.agentId,
    receipts: agent.getReceipts(),
    chainRootHash: agent.getChain().computeRootHash(),
  });

  console.log('Handoff complete. Chain sent over encrypted P2P mesh.');
  console.log(`Root hash: ${agent.getChain().computeRootHash()}`);
}

async function runBuilder() {
  console.log('=== BUILDER (Machine B) ===');
  console.log('Waiting for chain from Researcher via AXL...');

  const incoming = await axl.waitForHandoff(60000);
  console.log(`Received from ${incoming.fromPeerId.slice(0, 16)}...`);
  console.log(`Chain: ${incoming.bundle.receipts.length} receipts`);

  // Continue the chain — Builder's receipts extend the Researcher's
  const agent = ReceiptAgent.continueFrom(incoming.bundle.receipts);

  agent.readFile('research-handoff.json', JSON.stringify(incoming.bundle));
  agent.callApi('https://evmrpc.0g.ai', '{"jsonrpc":"2.0","result":"0x4f1a2b"}');
  agent.decide('Research verified, chain intact', 'Anchor on 0G Mainnet');
  agent.produceOutput('Deployment manifest', JSON.stringify({
    researchReceipts: incoming.bundle.receipts.length,
    builderReceipts: 4,
    totalChain: incoming.bundle.receipts.length + 4,
  }));

  console.log(`Extended chain to ${agent.getReceipts().length} receipts`);
  console.log(`Chain valid: ${agent.verifyOwnChain()}`);
  console.log(`Root hash: ${agent.getChain().computeRootHash()}`);

  // Next: quality review, anchoring, identity minting...
  // See the full pipeline in demo/app/app/api/builder/route.ts
}

if (role === 'researcher') {
  runResearcher().catch(console.error);
} else {
  runBuilder().catch(console.error);
}
