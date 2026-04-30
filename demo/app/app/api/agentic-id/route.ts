import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const AGENT_NFT_ABI = [
  'function mint(tuple(string dataDescription, bytes32 dataHash)[] iDatas, address to) external returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

export async function POST(request: Request) {
  try {
    const { agentId, publicKey, chainRootHash, receiptCount } = await request.json();

    const privateKey = process.env.PRIVATE_KEY;
    const contractAddress = process.env.AGENT_NFT_ADDRESS;

    const { ethers } = await import('ethers');

    const metadataHash = ethers.keccak256(
      ethers.toUtf8Bytes(
        JSON.stringify({
          agentId,
          ed25519PublicKey: publicKey,
          chainRootHash,
          receiptCount,
          standard: 'ERC-7857',
          capabilities: ['file_read', 'api_call', 'llm_call', 'decision', 'output'],
          timestamp: Date.now(),
        }),
      ),
    );

    if (!privateKey || !contractAddress) {
      return NextResponse.json({
        tokenId: null,
        metadataHash,
        agentId,
        standard: 'ERC-7857',
        status: 'no-wallet',
        reason: 'PRIVATE_KEY or AGENT_NFT_ADDRESS not configured — on-chain minting unavailable',
        iDatas: [
          { dataDescription: 'receipt-agent-v1', dataHash: metadataHash },
          { dataDescription: 'chain-root', dataHash: chainRootHash?.startsWith('0x') ? chainRootHash : `0x${chainRootHash ?? '0'.repeat(64)}` },
        ],
      });
    }

    const network = new ethers.Network('0g-mainnet', 16661);
    const provider = new ethers.JsonRpcProvider('https://evmrpc.0g.ai', network, { staticNetwork: true });
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(ethers.getAddress(contractAddress), AGENT_NFT_ABI, wallet);

    const iDatas = [
      { dataDescription: 'receipt-agent-v1', dataHash: metadataHash },
      { dataDescription: 'chain-root', dataHash: chainRootHash?.startsWith('0x') ? chainRootHash : `0x${chainRootHash}` },
    ];

    const tx = await contract.mint(iDatas, wallet.address);
    const receipt = await tx.wait();

    const transferLog = receipt.logs?.find(
      (l: any) => l.topics?.[0] === ethers.id('Transfer(address,address,uint256)'),
    );
    const tokenId = transferLog
      ? ethers.toBigInt(transferLog.topics[3]).toString()
      : null;

    return NextResponse.json({
      tokenId,
      txHash: receipt.hash,
      metadataHash,
      agentId,
      standard: 'ERC-7857',
      status: 'minted',
      chain: '0g-mainnet',
      chainId: 16661,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, status: 'error' }, { status: 500 });
  }
}
