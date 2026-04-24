import type { StorageResult } from '../types';

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

    const memData = new zgSdk.MemData(data);
    const [tree, treeErr] = await memData.merkleTree();

    if (treeErr || !tree) {
      return { rootHash: '', uploaded: false, error: treeErr?.message ?? 'Merkle tree computation failed' };
    }

    const rootHash: string = tree.rootHash();

    const indexer = new zgSdk.Indexer(indexerRpc);
    try {
      await indexer.upload(memData, signer);
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
  const memData = new zgSdk.MemData(encoder.encode(data));
  const [tree, err] = await memData.merkleTree();
  if (err || !tree) throw new Error(err?.message ?? 'Merkle tree computation failed');
  return tree.rootHash();
}
