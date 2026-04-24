import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const ENS_SEPOLIA = {
  registry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
  publicResolver: '0x8FADE66B79cC9f1C6F971901BaD22D47e458cE24',
};

const RESOLVER_ABI = [
  'function text(bytes32 node, string key) external view returns (string)',
  'function addr(bytes32 node) external view returns (address)',
];

const REGISTRY_ABI = [
  'function resolver(bytes32 node) external view returns (address)',
];

const RECORD_KEYS = [
  'receipt.pubkey', 'receipt.chainRoot', 'receipt.capabilities',
  'receipt.standard', 'receipt.teeProvider', 'avatar', 'description', 'url',
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name');
  if (!name) {
    return NextResponse.json({ error: 'Missing ?name= parameter' }, { status: 400 });
  }

  const rpc = process.env.SEPOLIA_RPC || 'https://rpc.sepolia.org';

  try {
    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider(rpc);
    const node = ethers.namehash(name);

    const registry = new ethers.Contract(ENS_SEPOLIA.registry, REGISTRY_ABI, provider);
    const resolverAddr = await registry.resolver(node);

    if (resolverAddr === ethers.ZeroAddress) {
      return NextResponse.json({ name, resolved: false, error: 'No resolver set' });
    }

    const resolver = new ethers.Contract(resolverAddr, RESOLVER_ABI, provider);

    const results = await Promise.allSettled(
      RECORD_KEYS.map(key => resolver.text(node, key)),
    );

    const records: Record<string, string> = {};
    for (let i = 0; i < RECORD_KEYS.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled' && r.value) {
        records[RECORD_KEYS[i]] = r.value;
      }
    }

    let address: string | null = null;
    try {
      const addr = await resolver.addr(node);
      if (addr !== ethers.ZeroAddress) address = addr;
    } catch {}

    return NextResponse.json({
      name,
      resolved: true,
      address,
      records,
      pubkey: records['receipt.pubkey'] || null,
      chainRoot: records['receipt.chainRoot'] || null,
      capabilities: records['receipt.capabilities']?.split(',') || [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ name, resolved: false, error: msg }, { status: 500 });
  }
}
