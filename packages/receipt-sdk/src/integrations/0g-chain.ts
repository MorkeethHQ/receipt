import type { AnchorResult } from '../types';

const RECEIPT_ANCHOR_V1_ABI = [
  'function anchorRoot(bytes32 chainRootHash, bytes32 storageRef) external',
  'event RootAnchored(bytes32 indexed chainRootHash, bytes32 storageRef, address indexed sender, uint256 timestamp)',
];

const RECEIPT_ANCHOR_V2_ABI = [
  'function anchorRoot(bytes32 chainRootHash, bytes32 storageRef, uint8 usefulnessScore) external',
  'event RootAnchored(bytes32 indexed chainRootHash, bytes32 storageRef, uint8 usefulnessScore, address indexed sender, uint256 timestamp)',
];

export interface AnchorConfig {
  rpc: string;
  contractAddress: string;
  privateKey: string;
  chainId?: number;
  usefulnessScore?: number;
}

export async function anchorOnChain(
  rootHash: string,
  storageRef: string | null,
  config: AnchorConfig,
): Promise<AnchorResult> {
  // @ts-ignore — optional peer dependency loaded at runtime
  const ethersModule: any = await import('ethers');
  const ethers = ethersModule.ethers ?? ethersModule;

  const useV2 = typeof config.usefulnessScore === 'number' && config.usefulnessScore > 0;
  const abi = useV2 ? RECEIPT_ANCHOR_V2_ABI : RECEIPT_ANCHOR_V1_ABI;

  const provider = new ethers.JsonRpcProvider(config.rpc, undefined, { staticNetwork: true });
  const wallet = new ethers.Wallet(config.privateKey, provider);
  const contract = new ethers.Contract(config.contractAddress, abi, wallet);

  const rootHashBytes = rootHash.startsWith('0x') ? rootHash : `0x${rootHash}`;
  const storageRefBytes = storageRef
    ? (storageRef.startsWith('0x') ? storageRef : `0x${storageRef}`)
    : ethers.ZeroHash;

  const score = Math.max(0, Math.min(100, Math.round(config.usefulnessScore ?? 0)));
  const tx = useV2
    ? await contract.anchorRoot(rootHashBytes, storageRefBytes, score)
    : await contract.anchorRoot(rootHashBytes, storageRefBytes);
  const receipt = await tx.wait();

  const network = await provider.getNetwork();

  return {
    txHash: receipt.hash,
    chainId: Number(network.chainId),
    blockNumber: receipt.blockNumber,
    rootHash,
    storageRef,
    usefulnessScore: useV2 ? score : undefined,
  };
}
