import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const RECEIPT_ANCHOR_V2_ABI = [
  'function anchorRoot(bytes32 chainRootHash, bytes32 storageRef, uint8 usefulnessScore) external',
  'event RootAnchored(bytes32 indexed chainRootHash, bytes32 storageRef, uint8 usefulnessScore, address indexed sender, uint256 timestamp)',
];

const RECEIPT_ANCHOR_V1_ABI = [
  'function anchorRoot(bytes32 chainRootHash, bytes32 storageRef) external',
  'event RootAnchored(bytes32 indexed chainRootHash, bytes32 storageRef, address indexed sender, uint256 timestamp)',
];

export async function POST(request: Request) {
  try {
    const { rootHash, storageRef, usefulnessScore } = await request.json();

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json({ error: 'No private key configured' }, { status: 500 });
    }

    const { ethers } = await import('ethers');
    const contractAddress = process.env.OG_CONTRACT_ADDRESS;
    if (!contractAddress) {
      return NextResponse.json({ error: 'No 0G contract address configured' }, { status: 500 });
    }

    const network = new ethers.Network('0g-mainnet', 16661);
    const provider = new ethers.JsonRpcProvider('https://evmrpc.0g.ai', network, { staticNetwork: true });
    const wallet = new ethers.Wallet(privateKey, provider);
    const score = typeof usefulnessScore === 'number' ? Math.max(0, Math.min(100, Math.round(usefulnessScore))) : 0;
    const useV2 = score > 0;
    const abi = useV2 ? RECEIPT_ANCHOR_V2_ABI : RECEIPT_ANCHOR_V1_ABI;
    const contract = new ethers.Contract(ethers.getAddress(contractAddress), abi, wallet);

    const rootHashBytes = rootHash.startsWith('0x') ? rootHash : `0x${rootHash}`;
    const storageRefBytes = storageRef
      ? (storageRef.startsWith('0x') ? storageRef : `0x${storageRef}`)
      : ethers.ZeroHash;

    const tx = useV2
      ? await contract.anchorRoot(rootHashBytes, storageRefBytes, score)
      : await contract.anchorRoot(rootHashBytes, storageRefBytes);
    const receipt = await tx.wait();

    return NextResponse.json({
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      chain: '0g-mainnet',
      chainId: 16661,
      usefulnessScore: useV2 ? score : undefined,
      contractVersion: useV2 ? 'v2' : 'v1',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
