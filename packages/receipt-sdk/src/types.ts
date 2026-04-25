export type ActionType = 'file_read' | 'api_call' | 'llm_call' | 'decision' | 'output' | 'usefulness_review';

export interface ReceiptAction {
  type: ActionType;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface Attestation {
  provider: string;
  type: 'tee' | 'zkp' | 'none';
  evidence: string;
  timestamp: number;
}

export interface Receipt {
  id: string;
  prevId: string | null;
  agentId: string;
  timestamp: number;
  action: ReceiptAction;
  inputHash: string;
  outputHash: string;
  attestation: Attestation | null;
  signature: string;
}

export interface HandoffBundle {
  chainRootHash: string;
  receipts: Receipt[];
  agentId: string;
  timestamp: number;
  storageRef: string | null;
}

export interface AgentKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface AnchorResult {
  txHash: string;
  chainId: number;
  blockNumber: number;
  rootHash: string;
  storageRef: string | null;
  usefulnessScore?: number;
}

export interface StorageResult {
  rootHash: string;
  uploaded: boolean;
  txHash?: string;
  error?: string;
}
