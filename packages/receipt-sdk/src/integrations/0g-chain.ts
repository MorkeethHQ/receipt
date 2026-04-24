import type { AnchorResult } from '../types';

const RECEIPT_ANCHOR_ABI = [
  'function anchorRoot(bytes32 chainRootHash, bytes32 storageRef) external',
  'event RootAnchored(bytes32 indexed chainRootHash, bytes32 storageRef, address indexed sender, uint256 timestamp)',
];

export interface AnchorConfig {
  rpc: string;
  contractAddress: string;
  privateKey: string;
  chainId?: number;
}

export async function anchorOnChain(
  rootHash: string,
  storageRef: string | null,
  config: AnchorConfig,
): Promise<AnchorResult> {
  // @ts-ignore — optional peer dependency loaded at runtime
  const ethersModule: any = await import('ethers');
  const ethers = ethersModule.ethers ?? ethersModule;

  const provider = new ethers.JsonRpcProvider(config.rpc, undefined, { staticNetwork: true });
  const wallet = new ethers.Wallet(config.privateKey, provider);
  const contract = new ethers.Contract(config.contractAddress, RECEIPT_ANCHOR_ABI, wallet);

  const rootHashBytes = rootHash.startsWith('0x') ? rootHash : `0x${rootHash}`;
  const storageRefBytes = storageRef
    ? (storageRef.startsWith('0x') ? storageRef : `0x${storageRef}`)
    : ethers.ZeroHash;

  const tx = await contract.anchorRoot(rootHashBytes, storageRefBytes);
  const receipt = await tx.wait();

  const network = await provider.getNetwork();

  return {
    txHash: receipt.hash,
    chainId: Number(network.chainId),
    blockNumber: receipt.blockNumber,
    rootHash,
    storageRef,
  };
}
