export interface ReputationEntry {
  agentId: string;
  publicKeyHex: string;
  scores: number[];
  avgScore: number;
  chainCount: number;
  lastActive: number;
}

export interface KvConfig {
  rpc: string;
  kvRpc: string;
  privateKey: string;
  streamId: string;
}

export async function writeReputation(
  config: KvConfig,
  entry: ReputationEntry,
): Promise<{ txHash: string; rootHash: string } | null> {
  // @ts-ignore — optional peer dependency loaded at runtime
  const zgSdk = await import('@0gfoundation/0g-ts-sdk');
  // @ts-ignore
  const ethersModule: any = await import('ethers');
  const ethers = ethersModule.ethers ?? ethersModule;

  const signer = new ethers.Wallet(
    config.privateKey,
    new ethers.JsonRpcProvider(config.rpc),
  );

  const indexer = new zgSdk.Indexer('https://indexer-storage-turbo.0g.ai');
  const sharded = await indexer.getShardedNodes();
  const nodeList = sharded.trusted ?? sharded.discovered;
  const [selected] = zgSdk.selectNodes(nodeList, 1);
  if (selected.length === 0) return null;

  const nodeClient = new zgSdk.StorageNode(selected[0].url);
  const nodeStatus = await nodeClient.getStatus();
  const flow = zgSdk.getFlowContract(nodeStatus.networkIdentity.flowAddress, signer);

  const builder = new zgSdk.StreamDataBuilder(1);
  const encoder = new TextEncoder();
  const key = encoder.encode(entry.agentId);
  const value = encoder.encode(JSON.stringify(entry));
  builder.set(config.streamId, key, value);

  const batcher = new zgSdk.Batcher(1, [nodeClient], flow, config.rpc);
  batcher.streamDataBuilder = builder;
  const [result, err] = await batcher.exec();
  if (err) throw err;
  return result;
}

export async function readReputation(
  kvRpc: string,
  streamId: string,
  agentId: string,
): Promise<ReputationEntry | null> {
  // @ts-ignore — optional peer dependency loaded at runtime
  const zgSdk = await import('@0gfoundation/0g-ts-sdk');
  const client = new zgSdk.KvClient(kvRpc);
  const encoder = new TextEncoder();
  const key = Array.from(encoder.encode(agentId));
  const value = await client.getValue(streamId, key);
  if (!value?.data) return null;
  const decoder = new TextDecoder();
  const raw = decoder.decode(new Uint8Array(value.data));
  return JSON.parse(raw) as ReputationEntry;
}
