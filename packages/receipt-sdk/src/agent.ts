import { generateKeyPair, publicKeyToHex } from './crypto';
import { createReceipt } from './receipt';
import { verifyChain } from './verify';
import { ReceiptChain } from './chain';
import type { Receipt, AgentKeyPair, ActionType, Attestation } from './types';

export class ReceiptAgent {
  readonly agentId: string;
  readonly keys: AgentKeyPair;
  private chain: ReceiptChain;

  constructor(keys?: AgentKeyPair) {
    this.keys = keys ?? generateKeyPair();
    this.agentId = publicKeyToHex(this.keys.publicKey).slice(0, 16);
    this.chain = new ReceiptChain();
  }

  static continueFrom(verifiedReceipts: Receipt[], keys?: AgentKeyPair): ReceiptAgent {
    const agent = new ReceiptAgent(keys);
    agent.chain = ReceiptChain.fromReceipts(verifiedReceipts);
    return agent;
  }

  private act(
    type: ActionType,
    description: string,
    input: string,
    output: string,
    attestation: Attestation | null = null,
  ): Receipt {
    const receipt = createReceipt(
      this.agentId,
      { type, description },
      input,
      output,
      this.keys,
      this.chain.getLastId(),
      attestation,
    );
    this.chain.append(receipt);
    return receipt;
  }

  readFile(path: string, content: string): Receipt {
    return this.act('file_read', `Read file: ${path}`, path, content);
  }

  callApi(endpoint: string, response: string): Receipt {
    return this.act('api_call', `API call: ${endpoint}`, endpoint, response);
  }

  callLlm(prompt: string, response: string, attestation: Attestation | null = null): Receipt {
    return this.act('llm_call', `LLM inference`, prompt, response, attestation);
  }

  decide(reasoning: string, decision: string): Receipt {
    return this.act('decision', `Decision made`, reasoning, decision);
  }

  produceOutput(description: string, output: string): Receipt {
    return this.act('output', description, description, output);
  }

  getReceipts(): Receipt[] {
    return this.chain.getReceipts();
  }

  getChain(): ReceiptChain {
    return this.chain;
  }

  getPublicKey(): Uint8Array {
    return this.keys.publicKey;
  }

  verifyOwnChain(): boolean {
    const results = verifyChain(this.chain.getReceipts(), this.keys.publicKey);
    return results.every((r) => r.valid);
  }
}
