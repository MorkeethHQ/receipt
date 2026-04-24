import { describe, it, expect } from 'vitest';
import { ReceiptAgent, ReceiptChain, verifyChain, generateKeyPair, hash } from '../core';

describe('Receipt SDK', () => {
  it('creates signed receipts with valid chain linkage', () => {
    const agent = new ReceiptAgent();

    agent.readFile('/test.txt', 'file contents');
    agent.callApi('https://api.example.com', '{"ok":true}');
    agent.decide('analyzed data', 'proceed with plan');

    const receipts = agent.getReceipts();
    expect(receipts).toHaveLength(3);
    expect(receipts[0].prevId).toBeNull();
    expect(receipts[1].prevId).toBe(receipts[0].id);
    expect(receipts[2].prevId).toBe(receipts[1].id);
  });

  it('verifies a valid chain', () => {
    const agent = new ReceiptAgent();
    agent.readFile('a.txt', 'aaa');
    agent.callApi('/endpoint', 'response');
    agent.produceOutput('result', 'done');

    const results = verifyChain(agent.getReceipts(), agent.getPublicKey());
    expect(results.every((r) => r.valid)).toBe(true);
  });

  it('detects tampered receipts', () => {
    const agent = new ReceiptAgent();
    agent.readFile('a.txt', 'aaa');
    agent.callApi('/endpoint', 'response');

    const receipts = agent.getReceipts();
    receipts[1] = { ...receipts[1], outputHash: hash('tampered') };

    const results = verifyChain(receipts, agent.getPublicKey());
    expect(results[1].valid).toBe(false);
    expect(results[1].checks.signatureValid).toBe(false);
  });

  it('detects broken chain linkage', () => {
    const agent = new ReceiptAgent();
    agent.readFile('a.txt', 'aaa');
    agent.callApi('/endpoint', 'response');

    const receipts = agent.getReceipts();
    receipts[1] = { ...receipts[1], prevId: 'wrong-id' };

    const results = verifyChain(receipts, agent.getPublicKey());
    expect(results[1].valid).toBe(false);
    expect(results[1].checks.chainLinkValid).toBe(false);
  });

  it('supports multi-agent handoff via continueFrom', () => {
    const agentA = new ReceiptAgent();
    agentA.readFile('task.md', 'task description');
    agentA.callLlm('analyze this', 'analysis result');
    agentA.produceOutput('handoff', 'data for agent B');

    const agentAReceipts = agentA.getReceipts();
    const resultsA = verifyChain(agentAReceipts, agentA.getPublicKey());
    expect(resultsA.every((r) => r.valid)).toBe(true);

    const agentB = ReceiptAgent.continueFrom(agentAReceipts);
    agentB.readFile('extra.md', 'more data');
    agentB.produceOutput('final', 'completed');

    const allReceipts = agentB.getReceipts();
    expect(allReceipts).toHaveLength(5);
    expect(allReceipts[3].prevId).toBe(allReceipts[2].id);
  });

  it('computes deterministic root hash', () => {
    const agent = new ReceiptAgent();
    agent.readFile('a.txt', 'content');
    agent.produceOutput('done', 'result');

    const chain = agent.getChain();
    const hash1 = chain.computeRootHash();
    const hash2 = chain.computeRootHash();
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('serializes and deserializes chains', () => {
    const agent = new ReceiptAgent();
    agent.readFile('a.txt', 'content');
    agent.callApi('/api', 'response');

    const chain = agent.getChain();
    const json = chain.serialize();
    const restored = ReceiptChain.deserialize(json);

    expect(restored.getReceipts()).toEqual(chain.getReceipts());
    expect(restored.computeRootHash()).toBe(chain.computeRootHash());
  });

  it('creates handoff bundles', () => {
    const agent = new ReceiptAgent();
    agent.readFile('a.txt', 'content');
    agent.produceOutput('done', 'result');

    const bundle = agent.getChain().toHandoffBundle(agent.agentId);
    expect(bundle.chainRootHash).toHaveLength(64);
    expect(bundle.receipts).toHaveLength(2);
    expect(bundle.agentId).toBe(agent.agentId);
    expect(bundle.storageRef).toBeNull();
  });
});
