import {
  ReceiptChain,
  verifyChain,
  anchorOnChain,
  storeChainOn0G,
} from '../../packages/receipt-sdk/dist/index.js';
import type { Receipt, AnchorConfig, AnchorResult } from '../../packages/receipt-sdk/dist/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Payload received from KeeperHub webhook trigger */
export interface WebhookPayload {
  /** Receipt chain to anchor. If absent the handler scans the pending store. */
  receipts?: Receipt[];
  /** Agent that produced the chain */
  agentId?: string;
  /** Public key hex for signature verification */
  publicKeyHex?: string;
  /** KeeperHub-specific metadata injected by the platform */
  keeperhub?: {
    workflowId?: string;
    executionId?: string;
    triggeredAt?: string;
  };
}

export interface AnchorSummary {
  rootHash: string;
  storageRef: string | null;
  chainLength: number;
  anchors: {
    chain: string;
    success: boolean;
    txHash?: string;
    error?: string;
  }[];
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Chain configs
// ---------------------------------------------------------------------------

const OG_MAINNET_CONFIG: AnchorConfig = {
  rpc: 'https://evmrpc.0g.ai',
  contractAddress: process.env.OG_CONTRACT_ADDRESS ?? '',
  privateKey: process.env.PRIVATE_KEY ?? '',
  chainId: 16661,
};

const BASE_SEPOLIA_CONFIG: AnchorConfig = {
  rpc: 'https://sepolia.base.org',
  contractAddress: process.env.BASE_CONTRACT_ADDRESS ?? '',
  privateKey: process.env.PRIVATE_KEY ?? '',
  chainId: 84532,
};

const CHAIN_LABELS = ['0G Mainnet', 'Base Sepolia'] as const;

// ---------------------------------------------------------------------------
// Pending chain store (in-memory for demo; production would use a database)
// ---------------------------------------------------------------------------

const pendingChains: Map<string, { receipts: Receipt[]; publicKeyHex?: string }> = new Map();

/** Queue a receipt chain for the next scheduled anchor run */
export function enqueuePendingChain(
  agentId: string,
  receipts: Receipt[],
  publicKeyHex?: string,
): void {
  pendingChains.set(agentId, { receipts, publicKeyHex });
}

/** Return all pending chains and clear the queue */
function drainPendingChains(): Map<string, { receipts: Receipt[]; publicKeyHex?: string }> {
  const snapshot = new Map(pendingChains);
  pendingChains.clear();
  return snapshot;
}

// ---------------------------------------------------------------------------
// Core handler
// ---------------------------------------------------------------------------

/**
 * Handle a KeeperHub webhook invocation.
 *
 * Two modes:
 * 1. **Direct** — payload contains `receipts[]`. Verify, store, and anchor that chain.
 * 2. **Scheduled scan** — payload has no receipts. Drain all pending (unanchored) chains
 *    and anchor each one.
 */
export async function handleWebhook(payload: WebhookPayload): Promise<AnchorSummary[]> {
  const executionId = payload.keeperhub?.executionId ?? 'manual';
  console.log(`[KeeperHub] Webhook received (execution: ${executionId})`);

  // Collect chains to process
  const chains: { agentId: string; receipts: Receipt[]; publicKeyHex?: string }[] = [];

  if (payload.receipts && payload.receipts.length > 0) {
    // Direct mode — single chain in the payload
    chains.push({
      agentId: payload.agentId ?? 'unknown',
      receipts: payload.receipts,
      publicKeyHex: payload.publicKeyHex,
    });
  } else {
    // Scheduled scan mode — drain all pending chains
    const pending = drainPendingChains();
    if (pending.size === 0) {
      console.log('[KeeperHub] No pending chains to anchor');
      return [];
    }
    for (const [agentId, entry] of pending) {
      chains.push({ agentId, receipts: entry.receipts, publicKeyHex: entry.publicKeyHex });
    }
  }

  console.log(`[KeeperHub] Processing ${chains.length} chain(s)`);

  const summaries: AnchorSummary[] = [];

  for (const { agentId, receipts, publicKeyHex } of chains) {
    try {
      const summary = await processChain(agentId, receipts, publicKeyHex);
      summaries.push(summary);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[KeeperHub] Failed to process chain for ${agentId}: ${msg}`);
      summaries.push({
        rootHash: '',
        storageRef: null,
        chainLength: receipts.length,
        anchors: [],
        timestamp: Date.now(),
      });
    }
  }

  console.log(
    `[KeeperHub] Done. Anchored ${summaries.filter((s) => s.anchors.some((a) => a.success)).length}/${summaries.length} chains`,
  );

  return summaries;
}

// ---------------------------------------------------------------------------
// Per-chain processing pipeline: verify -> store -> anchor
// ---------------------------------------------------------------------------

async function processChain(
  agentId: string,
  receipts: Receipt[],
  publicKeyHex?: string,
): Promise<AnchorSummary> {
  console.log(`[KeeperHub] Chain from ${agentId}: ${receipts.length} receipts`);

  // Step 1 — Rebuild and validate the chain structure
  const chain = ReceiptChain.fromReceipts(receipts);
  const rootHash = chain.computeRootHash();
  console.log(`[KeeperHub] Root hash: ${rootHash}`);

  // Step 2 — Cryptographic verification (if public key provided)
  if (publicKeyHex) {
    const pubKeyBytes = hexToBytes(publicKeyHex);
    const verificationResults = verifyChain(receipts, pubKeyBytes);
    const failures = verificationResults.filter((r) => !r.valid);
    if (failures.length > 0) {
      const failIds = failures.map((f) => f.receiptId).join(', ');
      throw new Error(`Chain verification failed for receipts: ${failIds}`);
    }
    console.log(`[KeeperHub] All ${receipts.length} receipts verified`);
  } else {
    console.log('[KeeperHub] No public key — skipping signature verification');
  }

  // Step 3 — Store on 0G Storage
  let storageRef: string | null = null;
  try {
    const storageResult = await storeChainOn0G(
      chain.serialize(),
      'https://indexer-storage-testnet-turbo.0g.ai',
      'https://evmrpc-testnet.0g.ai',
      process.env.PRIVATE_KEY ?? '',
    );
    storageRef = storageResult.rootHash || null;
    console.log(
      `[KeeperHub] 0G Storage: ${storageResult.uploaded ? 'uploaded' : 'root computed'} — ${storageRef}`,
    );
  } catch {
    console.log('[KeeperHub] 0G Storage: skipped (no funds or connection)');
  }

  // Step 4 — Anchor on both chains in parallel
  const anchorConfigs: [string, AnchorConfig][] = [
    [CHAIN_LABELS[0], OG_MAINNET_CONFIG],
    [CHAIN_LABELS[1], BASE_SEPOLIA_CONFIG],
  ];

  const results = await Promise.allSettled(
    anchorConfigs.map(([, config]) => anchorOnChain(rootHash, storageRef, config)),
  );

  const anchors = results.map((result, i) => {
    const chainName = anchorConfigs[i][0];
    if (result.status === 'fulfilled') {
      console.log(`[KeeperHub] Anchored on ${chainName}: tx ${result.value.txHash}`);
      return { chain: chainName, success: true, txHash: result.value.txHash };
    }
    const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
    console.log(`[KeeperHub] ${chainName} anchor failed: ${errMsg}`);
    return { chain: chainName, success: false, error: errMsg };
  });

  return {
    rootHash,
    storageRef,
    chainLength: receipts.length,
    anchors,
    timestamp: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
