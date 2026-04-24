import { NextResponse } from 'next/server';
import { createHash } from 'crypto';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { chainData } = await request.json();

    const { MerkleTree, MemData } = await import('@0gfoundation/0g-ts-sdk');

    const encoder = new TextEncoder();
    const data = encoder.encode(typeof chainData === 'string' ? chainData : JSON.stringify(chainData));

    const tree = new MerkleTree();
    const hash = createHash('sha256').update(data).digest('hex');
    tree.addLeafByHash(hash);
    tree.build();

    const rootBuf = tree.rootHash();
    const rootHash = Buffer.isBuffer(rootBuf) ? rootBuf.toString('hex') : String(rootBuf);

    let uploaded = false;
    try {
      const privateKey = process.env.PRIVATE_KEY;
      if (privateKey) {
        const { ethers } = await import('ethers');
        const { Indexer } = await import('@0gfoundation/0g-ts-sdk');

        const storageRpc = 'https://evmrpc-testnet.0g.ai';
        const storageProvider = new ethers.JsonRpcProvider(storageRpc);
        const signer = new ethers.Wallet(privateKey, storageProvider);
        const indexer = new Indexer('https://indexer-storage-testnet-turbo.0g.ai');

        const memData = new MemData(data);
        await indexer.upload(memData, storageRpc, signer);
        uploaded = true;
      }
    } catch {
      // Upload failed — root hash still valid
    }

    return NextResponse.json({ rootHash, uploaded });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
