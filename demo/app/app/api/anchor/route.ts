import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const RECEIPT_ANCHOR_ABI = [
  'function anchorRoot(bytes32 chainRootHash, bytes32 storageRef) external',
  'event RootAnchored(bytes32 indexed chainRootHash, bytes32 storageRef, address indexed sender, uint256 timestamp)',
];

export async function POST(request: Request) {
  try {
    const { rootHash, storageRef } = await request.json();

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json({ error: 'No private key configured' }, { status: 500 });
    }

    const { ethers } = await import('ethers');
    const contractAddress = process.env.BASE_CONTRACT_ADDRESS;
    if (!contractAddress) {
      return NextResponse.json({ error: 'No Base contract address configured' }, { status: 500 });
    }

    const provider = new ethers.JsonRpcProvider('https://sepolia.base.org', undefined, { staticNetwork: true });
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(contractAddress, RECEIPT_ANCHOR_ABI, wallet);

    const rootHashBytes = rootHash.startsWith('0x') ? rootHash : `0x${rootHash}`;
    const storageRefBytes = storageRef
      ? (storageRef.startsWith('0x') ? storageRef : `0x${storageRef}`)
      : ethers.ZeroHash;

    const tx = await contract.anchorRoot(rootHashBytes, storageRefBytes);
    const receipt = await tx.wait();

    return NextResponse.json({
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      chain: 'base-sepolia',
      chainId: 84532,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
