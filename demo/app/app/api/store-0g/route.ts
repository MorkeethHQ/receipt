import { NextResponse } from 'next/server';
import { createHash } from 'crypto';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { chainData } = await request.json();

    const { MemData, Indexer } = await import('@0gfoundation/0g-ts-sdk');

    const encoder = new TextEncoder();
    const data = encoder.encode(typeof chainData === 'string' ? chainData : JSON.stringify(chainData));

    const memData = new MemData(data);

    // v1.2.6: use memData.merkleTree() instead of new MerkleTree()
    let rootHash = '';
    try {
      const treeResult = await memData.merkleTree();
      const [tree, treeErr] = Array.isArray(treeResult) ? treeResult : [treeResult, null];
      if (treeErr || !tree) throw treeErr ?? new Error('No tree');
      const rootBuf = tree.rootHash();
      rootHash = Buffer.isBuffer(rootBuf) ? rootBuf.toString('hex') : String(rootBuf);
    } catch {
      rootHash = createHash('sha256').update(data).digest('hex');
    }

    let uploaded = false;
    let txHash = '';
    try {
      const privateKey = process.env.PRIVATE_KEY;
      if (privateKey) {
        const { ethers } = await import('ethers');

        const storageRpc = 'https://evmrpc.0g.ai';
        const storageProvider = new ethers.JsonRpcProvider(storageRpc);
        const signer = new ethers.Wallet(privateKey, storageProvider);
        const indexer = new Indexer('https://indexer-storage-turbo.0g.ai');

        const uploadResult = await indexer.upload(memData, storageRpc, signer);
        const [tx, err] = Array.isArray(uploadResult) ? uploadResult : [uploadResult, null];
        if (err) throw err;
        txHash = (tx as any)?.txHash ?? (tx as any)?.transactionHash ?? '';
        uploaded = true;
      }
    } catch {
      // Upload failed, root hash still valid
    }

    return NextResponse.json({ rootHash, uploaded, txHash });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
