import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { AgentKeyPair } from './types';

ed25519.etc.sha512Sync = (...m: Uint8Array[]) => {
  const h = sha512.create();
  m.forEach((b) => h.update(b));
  return h.digest();
};

export function hash(data: string): string {
  const bytes = new TextEncoder().encode(data);
  return bytesToHex(sha256(bytes));
}

export function generateKeyPair(): AgentKeyPair {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

export function sign(message: string, privateKey: Uint8Array): string {
  const msgBytes = new TextEncoder().encode(message);
  const sig = ed25519.sign(msgBytes, privateKey);
  return bytesToHex(sig);
}

export function verify(message: string, signature: string, publicKey: Uint8Array): boolean {
  const msgBytes = new TextEncoder().encode(message);
  const sigBytes = hexToBytes(signature);
  return ed25519.verify(sigBytes, msgBytes, publicKey);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function publicKeyToHex(key: Uint8Array): string {
  return bytesToHex(key);
}
