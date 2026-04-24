import { v4 as uuidv4 } from 'uuid';
import { hash, sign } from './crypto';
import type { Receipt, ReceiptAction, AgentKeyPair, Attestation } from './types';

export function createReceipt(
  agentId: string,
  action: ReceiptAction,
  input: string,
  output: string,
  keys: AgentKeyPair,
  prevId: string | null = null,
  attestation: Attestation | null = null,
): Receipt {
  const id = uuidv4();
  const timestamp = Date.now();
  const inputHash = hash(input);
  const outputHash = hash(output);

  const sigPayload = `${id}:${prevId ?? 'null'}:${agentId}:${timestamp}:${action.type}:${inputHash}:${outputHash}`;
  const signature = sign(sigPayload, keys.privateKey);

  return {
    id,
    prevId,
    agentId,
    timestamp,
    action,
    inputHash,
    outputHash,
    attestation,
    signature,
  };
}

export function getSignaturePayload(receipt: Receipt): string {
  return `${receipt.id}:${receipt.prevId ?? 'null'}:${receipt.agentId}:${receipt.timestamp}:${receipt.action.type}:${receipt.inputHash}:${receipt.outputHash}`;
}
