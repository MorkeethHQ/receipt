import { NextResponse } from 'next/server';
import { ReceiptChain, verifyChain } from '@receipt/sdk';
import type { Receipt } from '@receipt/sdk';
import { anchorOnChain, type AnchorConfig } from '@receipt/sdk/integrations/0g-chain';
import { storeChainOn0G } from '@receipt/sdk/integrations/0g-storage';

export const runtime = 'nodejs';

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

// ---------------------------------------------------------------------------
// In-memory pending chain store
// ---------------------------------------------------------------------------

const pendingChains: Map<string, { receipts: Receipt[]; publicKeyHex?: string }> = new Map();

function enqueuePendingChain(
  agentId: string,
  receipts: Receipt[],
  publicKeyHex?: string,
): void {
  pendingChains.set(agentId, { receipts, publicKeyHex });
}

// ---------------------------------------------------------------------------
// POST /api/keeperhub — KeeperHub webhook endpoint
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const payload = await request.json();

    console.log(
      '[KeeperHub] Webhook received:',
      JSON.stringify(payload).slice(0, 300),
    );

    // Determine which chains to process
    const chains: { agentId: string; receipts: Receipt[]; publicKeyHex?: string }[] = [];

    if (payload.receipts && Array.isArray(payload.receipts) && payload.receipts.length > 0) {
      // Direct mode: receipts included in the webhook payload
      chains.push({
        agentId: payload.agentId ?? 'webhook-direct',
        receipts: payload.receipts,
        publicKeyHex: payload.publicKeyHex,
      });
    } else {
      // Scheduled scan mode: drain all pending chains
      for (const [agentId, entry] of pendingChains) {
        chains.push({ agentId, ...entry });
      }
      pendingChains.clear();
    }

    if (chains.length === 0) {
      return NextResponse.json({
        status: 'ok',
        message: 'No pending chains to anchor',
        chainsProcessed: 0,
        timestamp: Date.now(),
      });
    }

    // Process each chain: verify -> store -> anchor
    const results = [];

    for (const { agentId, receipts, publicKeyHex } of chains) {
      try {
        // Rebuild chain and compute root
        const chain = ReceiptChain.fromReceipts(receipts);
        const rootHash = chain.computeRootHash();

        // Verify signatures if public key is available
        let verified = false;
        if (publicKeyHex) {
          const pubKeyBytes = hexToBytes(publicKeyHex);
          const verificationResults = verifyChain(receipts, pubKeyBytes);
          const failures = verificationResults.filter((r) => !r.valid);
          if (failures.length > 0) {
            results.push({
              agentId,
              rootHash,
              error: `Verification failed for ${failures.length} receipt(s)`,
              anchored: false,
            });
            continue;
          }
          verified = true;
        }

        // Store on 0G Storage
        let storageRef: string | null = null;
        try {
          const storageResult = await storeChainOn0G(
            chain.serialize(),
            'https://indexer-storage-turbo.0g.ai',
            'https://evmrpc.0g.ai',
            process.env.PRIVATE_KEY ?? '',
          );
          storageRef = storageResult.rootHash || null;
        } catch {
          // Storage is best-effort
        }

        // Anchor on both chains in parallel
        const anchorResults = await Promise.allSettled([
          anchorOnChain(rootHash, storageRef, OG_MAINNET_CONFIG),
          anchorOnChain(rootHash, storageRef, BASE_SEPOLIA_CONFIG),
        ]);

        const anchors = anchorResults.map((r, i) => {
          const chainName = i === 0 ? '0G Mainnet' : 'Base Sepolia';
          if (r.status === 'fulfilled') {
            return { chain: chainName, txHash: r.value.txHash, success: true };
          }
          return {
            chain: chainName,
            success: false,
            error: r.reason instanceof Error ? r.reason.message : String(r.reason),
          };
        });

        results.push({
          agentId,
          rootHash,
          storageRef,
          chainLength: receipts.length,
          verified,
          anchors,
          anchored: anchors.some((a) => a.success),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ agentId, error: msg, anchored: false });
      }
    }

    const elapsed = Date.now() - startTime;

    return NextResponse.json({
      status: 'processed',
      chainsProcessed: results.length,
      chainsAnchored: results.filter((r) => r.anchored).length,
      results,
      elapsed: `${elapsed}ms`,
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[KeeperHub] Webhook error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET /api/keeperhub — Health check for KeeperHub to verify endpoint is alive
// ---------------------------------------------------------------------------

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'receipt-keeperhub-webhook',
    pendingChains: pendingChains.size,
    timestamp: Date.now(),
  });
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
