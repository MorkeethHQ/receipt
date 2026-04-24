import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { chainData } = await request.json();

    const { MemData } = await import('@0gfoundation/0g-ts-sdk');

    const encoder = new TextEncoder();
    const data = encoder.encode(typeof chainData === 'string' ? chainData : JSON.stringify(chainData));
    const memData = new MemData(data);
    const [tree, treeErr] = await memData.merkleTree();

    if (treeErr || !tree) {
      return NextResponse.json({
        rootHash: null,
        uploaded: false,
        error: treeErr?.message ?? 'Merkle tree computation failed',
      });
    }

    const rootHash = tree.rootHash();

    let uploaded = false;
    try {
      const privateKey = process.env.PRIVATE_KEY;
      if (privateKey) {
        const { ethers } = await import('ethers');
        const { Indexer } = await import('@0gfoundation/0g-ts-sdk');

        const provider = new ethers.JsonRpcProvider('https://evmrpc-testnet-galileo.0g.ai');
        const signer = new ethers.Wallet(privateKey, provider);
        const indexer = new Indexer('https://indexer-storage-testnet-turbo.0g.ai');

        await indexer.upload(memData, signer);
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
