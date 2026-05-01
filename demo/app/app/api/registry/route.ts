import { NextResponse } from 'next/server';

const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_RECEIPT_REGISTRY_ADDRESS ?? '0x717D062E47898441a51EAdcA40873190A339B328';
const OG_RPC = 'https://evmrpc.0g.ai';

const REGISTRY_ABI = [
  'function registerChain(bytes32 rootHash, uint8 qualityScore, string agentId, string source, uint16 receiptCount, bytes32 anchorRef) external',
  'function getChains(address owner) external view returns (tuple(bytes32 rootHash, uint8 qualityScore, string agentId, string source, uint16 receiptCount, uint256 timestamp, bytes32 anchorRef)[])',
  'function getChainCount(address owner) external view returns (uint256)',
  'function totalChains() external view returns (uint256)',
];

async function getEthers() {
  const mod: any = await import('ethers');
  return mod.ethers ?? mod;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get('wallet');
  const total = searchParams.get('total');

  const ethers = await getEthers();
  const network = new ethers.Network('0g-mainnet', 16661);
  const provider = new ethers.JsonRpcProvider(OG_RPC, network, { staticNetwork: network });
  const contract = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);

  if (total) {
    try {
      const t = await contract.totalChains();
      return NextResponse.json({ total: Number(t) });
    } catch {
      return NextResponse.json({ total: 0 });
    }
  }

  if (!wallet) {
    return NextResponse.json({ error: 'wallet parameter required' }, { status: 400 });
  }

  try {
    const raw = await contract.getChains(wallet);
    const chains = raw.map((c: any) => ({
      rootHash: c.rootHash,
      qualityScore: Number(c.qualityScore),
      agentId: c.agentId,
      source: c.source,
      receiptCount: Number(c.receiptCount),
      timestamp: Number(c.timestamp),
      anchorRef: c.anchorRef,
    }));
    return NextResponse.json({ chains });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ chains: [], error: msg });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { rootHash, qualityScore, agentId, source, receiptCount } = body;

    if (!rootHash) {
      return NextResponse.json({ error: 'rootHash required' }, { status: 400 });
    }

    const ethers = await getEthers();
    const iface = new ethers.Interface(REGISTRY_ABI);

    let rootHashBytes = rootHash;
    if (!rootHashBytes.startsWith('0x')) {
      rootHashBytes = '0x' + rootHashBytes;
    }
    // Pad to bytes32 if needed
    if (rootHashBytes.length < 66) {
      rootHashBytes = rootHashBytes + '0'.repeat(66 - rootHashBytes.length);
    }

    const score = Math.max(0, Math.min(100, Math.round(qualityScore ?? 0)));
    const count = Math.max(1, Math.min(65535, Math.round(receiptCount ?? 1)));
    const anchorRef = ethers.ZeroHash;

    const txData = iface.encodeFunctionData('registerChain', [
      rootHashBytes,
      score,
      agentId ?? 'unknown',
      source ?? 'demo',
      count,
      anchorRef,
    ]);

    return NextResponse.json({ txData });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
