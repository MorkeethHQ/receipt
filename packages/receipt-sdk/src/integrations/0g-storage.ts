import type { StorageResult } from '../types';

function computeHashHex(data: Uint8Array): string {
  const { createHash } = require('crypto');
  return createHash('sha256').update(data).digest('hex');
}

export async function storeChainOn0G(
  chainData: string,
  indexerRpc: string,
  evmRpc: string,
  privateKey: string,
): Promise<StorageResult> {
  try {
    // @ts-ignore — optional peer dependency
    const zgSdk: any = await import('@0gfoundation/0g-ts-sdk');
    // @ts-ignore — optional peer dependency
    const ethersModule: any = await import('ethers');
    const ethers = ethersModule.ethers ?? ethersModule;

    const provider = new ethers.JsonRpcProvider(evmRpc);
    const signer = new ethers.Wallet(privateKey, provider);

    const encoder = new TextEncoder();
    const data = encoder.encode(chainData);

    const tree = new zgSdk.MerkleTree();
    tree.addLeafByHash(computeHashHex(data));
    tree.build();
    const rootBuf = tree.rootHash();
    const rootHash = Buffer.isBuffer(rootBuf) ? rootBuf.toString('hex') : String(rootBuf);

    const memData = new zgSdk.MemData(data);
    const indexer = new zgSdk.Indexer(indexerRpc);
    try {
      await indexer.upload(memData, evmRpc, signer);
      return { rootHash, uploaded: true };
    } catch (uploadErr: unknown) {
      const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
      return { rootHash, uploaded: false, error: `Upload failed (root hash computed): ${msg}` };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { rootHash: '', uploaded: false, error: msg };
  }
}

export async function computeMerkleRoot(data: string): Promise<string> {
  // @ts-ignore — optional peer dependency
  const zgSdk: any = await import('@0gfoundation/0g-ts-sdk');
  const encoder = new TextEncoder();
  const bytes = encoder.encode(data);

  const tree = new zgSdk.MerkleTree();
  tree.addLeafByHash(computeHashHex(bytes));
  tree.build();
  const rootBuf = tree.rootHash();
  return Buffer.isBuffer(rootBuf) ? rootBuf.toString('hex') : String(rootBuf);
}
