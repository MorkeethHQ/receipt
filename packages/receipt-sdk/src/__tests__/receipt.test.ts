import { describe, it, expect } from 'vitest';
import {
  ReceiptAgent,
  ReceiptChain,
  verifyChain,
  verifyReceipt,
  generateKeyPair,
  hash,
  sign,
  verify,
  publicKeyToHex,
  createReceipt,
  getSignaturePayload,
} from '../core';
import {
  receiptsToTrainingData,
  trainingDataToJsonl,
  chainToFineTuningDataset,
} from '../integrations/training-data';
import type { Receipt } from '../types';

// ---------------------------------------------------------------------------
// 1. ReceiptAgent creation
// ---------------------------------------------------------------------------
describe('ReceiptAgent creation', () => {
  it('generates a unique agentId and keypair on construction', () => {
    const agent = new ReceiptAgent();
    expect(agent.agentId).toBeDefined();
    expect(agent.agentId).toHaveLength(16); // first 16 hex chars of pubkey
    expect(agent.keys.publicKey).toBeInstanceOf(Uint8Array);
    expect(agent.keys.privateKey).toBeInstanceOf(Uint8Array);
    expect(agent.keys.publicKey.length).toBe(32);
    expect(agent.keys.privateKey.length).toBe(32);
  });

  it('creates distinct agents with unique ids', () => {
    const a = new ReceiptAgent();
    const b = new ReceiptAgent();
    expect(a.agentId).not.toBe(b.agentId);
  });

  it('accepts pre-existing keys', () => {
    const keys = generateKeyPair();
    const agent = new ReceiptAgent(keys);
    expect(agent.keys).toBe(keys);
    expect(agent.agentId).toBe(publicKeyToHex(keys.publicKey).slice(0, 16));
  });
});

// ---------------------------------------------------------------------------
// 2. Receipt generation for all 5 action types
// ---------------------------------------------------------------------------
describe('Receipt generation — all action types', () => {
  it('readFile produces a file_read receipt', () => {
    const agent = new ReceiptAgent();
    const r = agent.readFile('/etc/hosts', '127.0.0.1 localhost');
    expect(r.action.type).toBe('file_read');
    expect(r.action.description).toContain('/etc/hosts');
    expect(r.agentId).toBe(agent.agentId);
  });

  it('callApi produces an api_call receipt', () => {
    const agent = new ReceiptAgent();
    const r = agent.callApi('https://api.example.com/data', '{"status":"ok"}');
    expect(r.action.type).toBe('api_call');
    expect(r.action.description).toContain('https://api.example.com/data');
  });

  it('callLlm produces an llm_call receipt', () => {
    const agent = new ReceiptAgent();
    const r = agent.callLlm('Summarize this', 'Summary: ...');
    expect(r.action.type).toBe('llm_call');
    expect(r.action.description).toBe('LLM inference');
  });

  it('decide produces a decision receipt', () => {
    const agent = new ReceiptAgent();
    const r = agent.decide('Cost is too high', 'Switch to cheaper provider');
    expect(r.action.type).toBe('decision');
    expect(r.action.description).toBe('Decision made');
  });

  it('produceOutput produces an output receipt', () => {
    const agent = new ReceiptAgent();
    const r = agent.produceOutput('Final report', 'Report body...');
    expect(r.action.type).toBe('output');
    expect(r.action.description).toBe('Final report');
  });
});

// ---------------------------------------------------------------------------
// 3. Hash chain integrity (prevId linkage)
// ---------------------------------------------------------------------------
describe('Hash chain integrity', () => {
  it('first receipt has prevId === null, subsequent receipts link to predecessor', () => {
    const agent = new ReceiptAgent();
    agent.readFile('a.txt', 'aaa');
    agent.callApi('/ep', 'resp');
    agent.decide('reason', 'go');
    agent.callLlm('prompt', 'answer');
    agent.produceOutput('out', 'data');

    const receipts = agent.getReceipts();
    expect(receipts).toHaveLength(5);
    expect(receipts[0].prevId).toBeNull();
    for (let i = 1; i < receipts.length; i++) {
      expect(receipts[i].prevId).toBe(receipts[i - 1].id);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. inputHash and outputHash correctness
// ---------------------------------------------------------------------------
describe('inputHash and outputHash correctness', () => {
  it('inputHash matches SHA-256 of input, outputHash matches SHA-256 of output', () => {
    const agent = new ReceiptAgent();
    const inputData = '/path/to/file.txt';
    const outputData = 'file contents here';

    const r = agent.readFile(inputData, outputData);
    expect(r.inputHash).toBe(hash(inputData));
    expect(r.outputHash).toBe(hash(outputData));
  });

  it('different inputs produce different hashes', () => {
    const agent = new ReceiptAgent();
    const r1 = agent.readFile('a.txt', 'aaa');
    const r2 = agent.readFile('b.txt', 'bbb');
    expect(r1.inputHash).not.toBe(r2.inputHash);
    expect(r1.outputHash).not.toBe(r2.outputHash);
  });

  it('hashes are 64 hex characters (SHA-256)', () => {
    const agent = new ReceiptAgent();
    const r = agent.callApi('/test', 'response');
    expect(r.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.outputHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// 5. Signature verification passes for untampered receipts
// ---------------------------------------------------------------------------
describe('Signature verification — untampered', () => {
  it('each receipt in a chain passes signature verification', () => {
    const agent = new ReceiptAgent();
    agent.readFile('x.txt', 'xxx');
    agent.callApi('/api', 'resp');
    agent.produceOutput('done', 'ok');

    const receipts = agent.getReceipts();
    for (let i = 0; i < receipts.length; i++) {
      const expectedPrevId = i === 0 ? null : receipts[i - 1].id;
      const result = verifyReceipt(receipts[i], agent.getPublicKey(), expectedPrevId);
      expect(result.valid).toBe(true);
      expect(result.checks.signatureValid).toBe(true);
      expect(result.checks.chainLinkValid).toBe(true);
      expect(result.checks.timestampValid).toBe(true);
    }
  });

  it('signature payload matches getSignaturePayload', () => {
    const agent = new ReceiptAgent();
    const r = agent.readFile('test.txt', 'data');
    const payload = getSignaturePayload(r);
    expect(verify(payload, r.signature, agent.getPublicKey())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Chain tamper detection — modify outputHash
// ---------------------------------------------------------------------------
describe('Chain tamper detection — outputHash modification', () => {
  it('changing outputHash invalidates the signature for that receipt', () => {
    const agent = new ReceiptAgent();
    agent.readFile('a.txt', 'aaa');
    agent.callApi('/endpoint', 'response');
    agent.produceOutput('final', 'result');

    const receipts = agent.getReceipts();
    // tamper with the middle receipt
    receipts[1] = { ...receipts[1], outputHash: hash('tampered-value') };

    const results = verifyChain(receipts, agent.getPublicKey());
    expect(results[0].valid).toBe(true);
    expect(results[1].valid).toBe(false);
    expect(results[1].checks.signatureValid).toBe(false);
    // chain link is still correct because we didn't touch prevId
    expect(results[1].checks.chainLinkValid).toBe(true);
    // receipt after tampered one remains valid (tamper is isolated to sig)
    expect(results[2].valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. ReceiptAgent.continueFrom() extends from existing chain
// ---------------------------------------------------------------------------
describe('ReceiptAgent.continueFrom()', () => {
  it('correctly extends from an existing chain', () => {
    const agentA = new ReceiptAgent();
    agentA.readFile('task.md', 'task description');
    agentA.callLlm('analyze this', 'analysis result');
    agentA.produceOutput('handoff', 'data for agent B');

    const agentAReceipts = agentA.getReceipts();

    const agentB = ReceiptAgent.continueFrom(agentAReceipts);
    agentB.readFile('extra.md', 'more data');
    agentB.produceOutput('final', 'completed');

    const allReceipts = agentB.getReceipts();
    expect(allReceipts).toHaveLength(5);
    // first 3 are agentA's
    expect(allReceipts[0].agentId).toBe(agentA.agentId);
    // new receipts link correctly
    expect(allReceipts[3].prevId).toBe(allReceipts[2].id);
    expect(allReceipts[4].prevId).toBe(allReceipts[3].id);
    // new receipts belong to agentB
    expect(allReceipts[3].agentId).toBe(agentB.agentId);
    expect(allReceipts[4].agentId).toBe(agentB.agentId);
  });

  it('new agent has different agentId than original', () => {
    const agentA = new ReceiptAgent();
    agentA.readFile('a.txt', 'a');

    const agentB = ReceiptAgent.continueFrom(agentA.getReceipts());
    expect(agentB.agentId).not.toBe(agentA.agentId);
  });

  it('accepts pre-existing keys when continuing', () => {
    const agentA = new ReceiptAgent();
    agentA.readFile('a.txt', 'content');

    const keys = generateKeyPair();
    const agentB = ReceiptAgent.continueFrom(agentA.getReceipts(), keys);
    expect(agentB.keys).toBe(keys);
  });
});

// ---------------------------------------------------------------------------
// 8. verifyChain() — clean chain
// ---------------------------------------------------------------------------
describe('verifyChain() — clean chain', () => {
  it('returns all valid for an untampered chain', () => {
    const agent = new ReceiptAgent();
    agent.readFile('a.txt', 'aaa');
    agent.callApi('/ep', 'response');
    agent.callLlm('prompt', 'answer');
    agent.decide('reason', 'go');
    agent.produceOutput('result', 'done');

    const results = verifyChain(agent.getReceipts(), agent.getPublicKey());
    expect(results).toHaveLength(5);
    expect(results.every((r) => r.valid)).toBe(true);
    expect(results.every((r) => r.error === undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. verifyChain() detects signature tampering
// ---------------------------------------------------------------------------
describe('verifyChain() — signature tampering', () => {
  it('detects a forged signature', () => {
    const agent = new ReceiptAgent();
    agent.readFile('a.txt', 'aaa');
    agent.callApi('/ep', 'resp');

    const receipts = agent.getReceipts();
    // forge the signature with a different key
    const otherKeys = generateKeyPair();
    const payload = getSignaturePayload(receipts[0]);
    const forgedSig = sign(payload, otherKeys.privateKey);
    receipts[0] = { ...receipts[0], signature: forgedSig };

    const results = verifyChain(receipts, agent.getPublicKey());
    expect(results[0].valid).toBe(false);
    expect(results[0].checks.signatureValid).toBe(false);
    expect(results[0].error).toContain('invalid signature');
  });
});

// ---------------------------------------------------------------------------
// 10. verifyChain() detects chain link tampering (wrong prevId)
// ---------------------------------------------------------------------------
describe('verifyChain() — chain link tampering', () => {
  it('detects a wrong prevId', () => {
    const agent = new ReceiptAgent();
    agent.readFile('a.txt', 'aaa');
    agent.callApi('/endpoint', 'response');
    agent.produceOutput('final', 'result');

    const receipts = agent.getReceipts();
    receipts[1] = { ...receipts[1], prevId: 'wrong-id-value' };

    const results = verifyChain(receipts, agent.getPublicKey());
    expect(results[1].valid).toBe(false);
    expect(results[1].checks.chainLinkValid).toBe(false);
    // signature also fails because prevId is part of the signed payload
    expect(results[1].checks.signatureValid).toBe(false);
    expect(results[1].error).toContain('broken chain link');
  });

  it('detects when first receipt has non-null prevId', () => {
    const agent = new ReceiptAgent();
    agent.readFile('a.txt', 'aaa');

    const receipts = agent.getReceipts();
    receipts[0] = { ...receipts[0], prevId: 'should-be-null' };

    const results = verifyChain(receipts, agent.getPublicKey());
    expect(results[0].valid).toBe(false);
    expect(results[0].checks.chainLinkValid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11. computeRootHash() consistency
// ---------------------------------------------------------------------------
describe('computeRootHash()', () => {
  it('returns a consistent 64-char hex hash', () => {
    const agent = new ReceiptAgent();
    agent.readFile('a.txt', 'content');
    agent.produceOutput('done', 'result');

    const chain = agent.getChain();
    const h1 = chain.computeRootHash();
    const h2 = chain.computeRootHash();
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different chains produce different root hashes', () => {
    const a1 = new ReceiptAgent();
    a1.readFile('a.txt', 'content-a');
    const a2 = new ReceiptAgent();
    a2.readFile('b.txt', 'content-b');

    expect(a1.getChain().computeRootHash()).not.toBe(a2.getChain().computeRootHash());
  });

  it('throws on empty chain', () => {
    const chain = new ReceiptChain();
    expect(() => chain.computeRootHash()).toThrow('Cannot compute root hash of empty chain');
  });
});

// ---------------------------------------------------------------------------
// 12. Training data conversion
// ---------------------------------------------------------------------------
describe('Training data conversion', () => {
  it('receiptsToTrainingData produces one example per receipt', () => {
    const agent = new ReceiptAgent();
    agent.readFile('a.txt', 'content');
    agent.callApi('/api', 'resp');
    agent.callLlm('prompt', 'answer');
    agent.decide('reason', 'go');
    agent.produceOutput('out', 'data');

    const receipts = agent.getReceipts();
    const examples = receiptsToTrainingData(receipts);
    expect(examples).toHaveLength(5);

    // Each example has a messages array with system, user, assistant
    for (const ex of examples) {
      expect(ex.messages).toHaveLength(3);
      expect(ex.messages[0].role).toBe('system');
      expect(ex.messages[1].role).toBe('user');
      expect(ex.messages[2].role).toBe('assistant');
    }
  });

  it('trainingDataToJsonl produces valid JSONL', () => {
    const agent = new ReceiptAgent();
    agent.readFile('a.txt', 'content');
    agent.callLlm('hello', 'world');

    const examples = receiptsToTrainingData(agent.getReceipts());
    const jsonl = trainingDataToJsonl(examples);
    const lines = jsonl.split('\n');
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
      const parsed = JSON.parse(line);
      expect(parsed.messages).toBeDefined();
    }
  });

  it('chainToFineTuningDataset returns jsonl and stats', () => {
    const agent = new ReceiptAgent();
    agent.readFile('a.txt', 'a');
    agent.callApi('/ep', 'resp');
    agent.callLlm('p', 'r');
    agent.callLlm('p2', 'r2');
    agent.decide('reason', 'go');
    agent.produceOutput('out', 'data');

    const receipts = agent.getReceipts();
    const result = chainToFineTuningDataset(receipts, agent.agentId);

    expect(result.stats.total).toBe(6);
    expect(result.stats.byType['file_read']).toBe(1);
    expect(result.stats.byType['api_call']).toBe(1);
    expect(result.stats.byType['llm_call']).toBe(2);
    expect(result.stats.byType['decision']).toBe(1);
    expect(result.stats.byType['output']).toBe(1);

    // jsonl is valid
    const lines = result.jsonl.split('\n');
    expect(lines).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// 13. Edge cases
// ---------------------------------------------------------------------------
describe('Edge cases', () => {
  it('empty chain — getReceipts returns empty array', () => {
    const agent = new ReceiptAgent();
    expect(agent.getReceipts()).toEqual([]);
    expect(agent.getChain().length()).toBe(0);
    expect(agent.getChain().getLastId()).toBeNull();
  });

  it('empty chain — verifyChain returns empty array', () => {
    const agent = new ReceiptAgent();
    const results = verifyChain([], agent.getPublicKey());
    expect(results).toEqual([]);
  });

  it('empty chain — verifyOwnChain returns true', () => {
    const agent = new ReceiptAgent();
    expect(agent.verifyOwnChain()).toBe(true);
  });

  it('single receipt chain — verifies successfully', () => {
    const agent = new ReceiptAgent();
    agent.readFile('only.txt', 'only content');

    const receipts = agent.getReceipts();
    expect(receipts).toHaveLength(1);
    expect(receipts[0].prevId).toBeNull();

    const results = verifyChain(receipts, agent.getPublicKey());
    expect(results).toHaveLength(1);
    expect(results[0].valid).toBe(true);
  });

  it('single receipt chain — computeRootHash works', () => {
    const agent = new ReceiptAgent();
    agent.readFile('solo.txt', 'solo');
    const rootHash = agent.getChain().computeRootHash();
    expect(rootHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('receiptsToTrainingData with empty array returns empty array', () => {
    expect(receiptsToTrainingData([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 14. Serialization / deserialization
// ---------------------------------------------------------------------------
describe('Chain serialization', () => {
  it('serializes and deserializes a chain preserving all data', () => {
    const agent = new ReceiptAgent();
    agent.readFile('a.txt', 'content');
    agent.callApi('/api', 'response');

    const chain = agent.getChain();
    const json = chain.serialize();
    const restored = ReceiptChain.deserialize(json);

    expect(restored.getReceipts()).toEqual(chain.getReceipts());
    expect(restored.computeRootHash()).toBe(chain.computeRootHash());
    expect(restored.length()).toBe(chain.length());
  });
});

// ---------------------------------------------------------------------------
// 15. Handoff bundles
// ---------------------------------------------------------------------------
describe('Handoff bundles', () => {
  it('creates a handoff bundle with correct fields', () => {
    const agent = new ReceiptAgent();
    agent.readFile('a.txt', 'content');
    agent.produceOutput('done', 'result');

    const bundle = agent.getChain().toHandoffBundle(agent.agentId);
    expect(bundle.chainRootHash).toMatch(/^[0-9a-f]{64}$/);
    expect(bundle.receipts).toHaveLength(2);
    expect(bundle.agentId).toBe(agent.agentId);
    expect(bundle.storageRef).toBeNull();
    expect(bundle.timestamp).toBeGreaterThan(0);
  });

  it('includes storageRef when provided', () => {
    const agent = new ReceiptAgent();
    agent.readFile('a.txt', 'content');

    const bundle = agent.getChain().toHandoffBundle(agent.agentId, '0x1234abcd');
    expect(bundle.storageRef).toBe('0x1234abcd');
  });
});

// ---------------------------------------------------------------------------
// 16. Crypto primitives
// ---------------------------------------------------------------------------
describe('Crypto primitives', () => {
  it('hash produces consistent SHA-256 output', () => {
    expect(hash('hello')).toBe(hash('hello'));
    expect(hash('hello')).not.toBe(hash('world'));
    expect(hash('hello')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sign + verify roundtrip works', () => {
    const keys = generateKeyPair();
    const message = 'test message 123';
    const sig = sign(message, keys.privateKey);
    expect(verify(message, sig, keys.publicKey)).toBe(true);
  });

  it('verify rejects wrong message', () => {
    const keys = generateKeyPair();
    const sig = sign('correct message', keys.privateKey);
    expect(verify('wrong message', sig, keys.publicKey)).toBe(false);
  });

  it('verify rejects wrong key', () => {
    const keys1 = generateKeyPair();
    const keys2 = generateKeyPair();
    const sig = sign('message', keys1.privateKey);
    expect(verify('message', sig, keys2.publicKey)).toBe(false);
  });

  it('publicKeyToHex returns 64-char hex string', () => {
    const keys = generateKeyPair();
    const hex = publicKeyToHex(keys.publicKey);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// 17. ReceiptChain.append() rejects broken linkage
// ---------------------------------------------------------------------------
describe('ReceiptChain.append() validation', () => {
  it('rejects a receipt with wrong prevId', () => {
    const agent = new ReceiptAgent();
    agent.readFile('a.txt', 'content');

    const chain = new ReceiptChain();
    const receipts = agent.getReceipts();
    // first receipt should have prevId null, so it goes in fine
    chain.append(receipts[0]);

    // now create a receipt whose prevId does not match
    const badReceipt: Receipt = {
      ...receipts[0],
      id: 'new-id',
      prevId: 'wrong-prev-id',
    };

    expect(() => chain.append(badReceipt)).toThrow('Chain linkage broken');
  });
});

// ---------------------------------------------------------------------------
// 18. verifyReceipt (individual)
// ---------------------------------------------------------------------------
describe('verifyReceipt() individual', () => {
  it('returns correct structure for valid receipt', () => {
    const agent = new ReceiptAgent();
    const r = agent.readFile('test.txt', 'data');

    const result = verifyReceipt(r, agent.getPublicKey(), null);
    expect(result.receiptId).toBe(r.id);
    expect(result.valid).toBe(true);
    expect(result.checks.signatureValid).toBe(true);
    expect(result.checks.chainLinkValid).toBe(true);
    expect(result.checks.timestampValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns error message for invalid receipt', () => {
    const agent = new ReceiptAgent();
    const r = agent.readFile('test.txt', 'data');

    // pass wrong expectedPrevId
    const result = verifyReceipt(r, agent.getPublicKey(), 'wrong-prev');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('broken chain link');
  });
});

// ---------------------------------------------------------------------------
// 19. LLM call with attestation
// ---------------------------------------------------------------------------
describe('LLM call with attestation', () => {
  it('stores attestation in the receipt', () => {
    const agent = new ReceiptAgent();
    const attestation = {
      provider: '0g-compute',
      type: 'tee' as const,
      evidence: 'attestation-evidence-data',
      timestamp: Date.now(),
    };

    const r = agent.callLlm('prompt', 'response', attestation);
    expect(r.attestation).not.toBeNull();
    expect(r.attestation!.provider).toBe('0g-compute');
    expect(r.attestation!.type).toBe('tee');
    expect(r.attestation!.evidence).toBe('attestation-evidence-data');

    // receipt still verifies
    const results = verifyChain(agent.getReceipts(), agent.getPublicKey());
    expect(results.every((v) => v.valid)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 20. verifyOwnChain
// ---------------------------------------------------------------------------
describe('verifyOwnChain()', () => {
  it('returns true for a valid chain', () => {
    const agent = new ReceiptAgent();
    agent.readFile('a.txt', 'aaa');
    agent.callApi('/ep', 'resp');
    agent.produceOutput('done', 'result');
    expect(agent.verifyOwnChain()).toBe(true);
  });
});
