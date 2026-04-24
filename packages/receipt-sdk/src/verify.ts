import { verify as ed25519Verify } from './crypto';
import { getSignaturePayload } from './receipt';
import type { Receipt } from './types';

export interface VerificationResult {
  valid: boolean;
  receiptId: string;
  checks: {
    signatureValid: boolean;
    chainLinkValid: boolean;
    timestampValid: boolean;
  };
  error?: string;
}

export function verifyReceipt(
  receipt: Receipt,
  publicKey: Uint8Array,
  expectedPrevId: string | null,
): VerificationResult {
  const payload = getSignaturePayload(receipt);
  const signatureValid = ed25519Verify(payload, receipt.signature, publicKey);

  const chainLinkValid = receipt.prevId === expectedPrevId;

  const timestampValid = receipt.timestamp > 0 && receipt.timestamp <= Date.now() + 60000;

  const valid = signatureValid && chainLinkValid && timestampValid;

  return {
    valid,
    receiptId: receipt.id,
    checks: { signatureValid, chainLinkValid, timestampValid },
    error: valid ? undefined : buildErrorMessage({ signatureValid, chainLinkValid, timestampValid }),
  };
}

export function verifyChain(receipts: Receipt[], publicKey: Uint8Array): VerificationResult[] {
  const results: VerificationResult[] = [];

  for (let i = 0; i < receipts.length; i++) {
    const expectedPrevId = i === 0 ? null : receipts[i - 1].id;
    results.push(verifyReceipt(receipts[i], publicKey, expectedPrevId));
  }

  return results;
}

function buildErrorMessage(checks: { signatureValid: boolean; chainLinkValid: boolean; timestampValid: boolean }): string {
  const errors: string[] = [];
  if (!checks.signatureValid) errors.push('invalid signature');
  if (!checks.chainLinkValid) errors.push('broken chain link');
  if (!checks.timestampValid) errors.push('invalid timestamp');
  return errors.join(', ');
}
