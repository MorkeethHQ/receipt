export interface EnsConfig {
  rpc: string;
  privateKey: string;
}

export interface AgentTextRecords {
  'receipt.pubkey': string;
  'receipt.chainRoot': string;
  'receipt.capabilities': string;
  'receipt.standard': string;
  'receipt.teeProvider': string;
  avatar?: string;
  description?: string;
  url?: string;
}

export interface EnsRegistrationResult {
  name: string;
  node: string;
  txHash: string;
  recordsSet: string[];
}

export interface ResolvedAgent {
  name: string;
  address: string | null;
  records: Partial<AgentTextRecords>;
}

const ENS_SEPOLIA = {
  registry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
  nameWrapper: '0x0635513f179D50A207757E05759CbD106d7dFcE8',
  publicResolver: '0x8FADE66B79cC9f1C6F971901BaD22D47e458cE24',
  registrarController: '0xFEd6a969AaA60E4961FCD3EBF1A2e8913BAe6060',
};

const NAME_WRAPPER_ABI = [
  'function setSubnodeRecord(bytes32 parentNode, string label, address owner, address resolver, uint64 ttl, uint32 fuses, uint64 expiry) external returns (bytes32)',
  'function ownerOf(uint256 id) external view returns (address)',
  'function getData(uint256 id) external view returns (address owner, uint32 fuses, uint64 expiry)',
];

const RESOLVER_ABI = [
  'function setText(bytes32 node, string key, string value) external',
  'function text(bytes32 node, string key) external view returns (string)',
  'function addr(bytes32 node) external view returns (address)',
  'function setAddr(bytes32 node, address addr) external',
  'function multicall(bytes[] calldata data) external returns (bytes[] memory)',
];

const REGISTRY_ABI = [
  'function owner(bytes32 node) external view returns (address)',
  'function resolver(bytes32 node) external view returns (address)',
  'function setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl) external',
];

const REGISTRAR_ABI = [
  'function available(string name) external view returns (bool)',
  'function makeCommitment(string name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] calldata data, bool reverseRecord, uint16 ownerControlledFuses) external pure returns (bytes32)',
  'function commit(bytes32 commitment) external',
  'function register(string name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] calldata data, bool reverseRecord, uint16 ownerControlledFuses) external payable',
  'function rentPrice(string name, uint256 duration) external view returns (uint256 base, uint256 premium)',
];

export async function registerParentName(
  name: string,
  config: EnsConfig,
): Promise<{ txHash: string; node: string }> {
  const ethersModule: any = await import('ethers');
  const ethers = ethersModule.ethers ?? ethersModule;

  const provider = new ethers.JsonRpcProvider(config.rpc);
  const wallet = new ethers.Wallet(config.privateKey, provider);
  const controller = new ethers.Contract(ENS_SEPOLIA.registrarController, REGISTRAR_ABI, wallet);

  const duration = 365 * 24 * 3600; // 1 year
  const secret = ethers.randomBytes(32);
  const data: string[] = [];

  const commitment = await controller.makeCommitment(
    name, wallet.address, duration, secret,
    ENS_SEPOLIA.publicResolver, data, false, 0,
  );

  const commitTx = await controller.commit(commitment);
  await commitTx.wait();

  // Must wait at least 60 seconds between commit and register
  await new Promise(r => setTimeout(r, 65000));

  const [base, premium] = await controller.rentPrice(name, duration);
  const price = base + premium;
  const registerTx = await controller.register(
    name, wallet.address, duration, secret,
    ENS_SEPOLIA.publicResolver, data, false, 0,
    { value: price * 110n / 100n },
  );
  const receipt = await registerTx.wait();

  return {
    txHash: receipt.hash,
    node: ethers.namehash(`${name}.eth`),
  };
}

export async function registerSubname(
  parentName: string,
  label: string,
  records: Partial<AgentTextRecords>,
  config: EnsConfig,
): Promise<EnsRegistrationResult> {
  const ethersModule: any = await import('ethers');
  const ethers = ethersModule.ethers ?? ethersModule;

  const provider = new ethers.JsonRpcProvider(config.rpc);
  const wallet = new ethers.Wallet(config.privateKey, provider);

  const parentNode = ethers.namehash(parentName);
  const subnameNode = ethers.namehash(`${label}.${parentName}`);
  const fullName = `${label}.${parentName}`;

  // Check if parent is owned by Name Wrapper (wrapped name)
  const registry = new ethers.Contract(ENS_SEPOLIA.registry, REGISTRY_ABI, wallet);
  const parentOwner = await registry.owner(parentNode);

  let txHash = '';

  if (parentOwner.toLowerCase() === ENS_SEPOLIA.nameWrapper.toLowerCase()) {
    // Parent is wrapped — use Name Wrapper
    const wrapper = new ethers.Contract(ENS_SEPOLIA.nameWrapper, NAME_WRAPPER_ABI, wallet);
    const tx = await wrapper.setSubnodeRecord(
      parentNode, label, wallet.address,
      ENS_SEPOLIA.publicResolver, 0, 0, 0,
    );
    const receipt = await tx.wait();
    txHash = receipt.hash;
  } else {
    // Parent is unwrapped — use Registry directly
    const labelHash = ethers.keccak256(ethers.toUtf8Bytes(label));
    const tx = await registry.setSubnodeRecord(
      parentNode, labelHash, wallet.address,
      ENS_SEPOLIA.publicResolver, 0,
    );
    const receipt = await tx.wait();
    txHash = receipt.hash;
  }

  // Set text records
  const recordsSet = await setTextRecords(fullName, records, config);

  return {
    name: fullName,
    node: subnameNode,
    txHash,
    recordsSet,
  };
}

export async function setTextRecords(
  name: string,
  records: Partial<AgentTextRecords>,
  config: EnsConfig,
): Promise<string[]> {
  const ethersModule: any = await import('ethers');
  const ethers = ethersModule.ethers ?? ethersModule;

  const provider = new ethers.JsonRpcProvider(config.rpc);
  const wallet = new ethers.Wallet(config.privateKey, provider);

  const node = ethers.namehash(name);
  const resolver = new ethers.Contract(ENS_SEPOLIA.publicResolver, RESOLVER_ABI, wallet);

  const entries = Object.entries(records).filter(([, v]) => v !== undefined);
  const recordsSet: string[] = [];

  // Use multicall if available to batch all setText calls
  try {
    const iface = new ethers.Interface(RESOLVER_ABI);
    const calls = entries.map(([key, value]) =>
      iface.encodeFunctionData('setText', [node, key, value!]),
    );
    const tx = await resolver.multicall(calls);
    await tx.wait();
    recordsSet.push(...entries.map(([k]) => k));
  } catch {
    // Fallback: set records one by one
    for (const [key, value] of entries) {
      const tx = await resolver.setText(node, key, value!);
      await tx.wait();
      recordsSet.push(key);
    }
  }

  return recordsSet;
}

export async function resolveAgent(
  name: string,
  config: EnsConfig,
): Promise<ResolvedAgent> {
  const ethersModule: any = await import('ethers');
  const ethers = ethersModule.ethers ?? ethersModule;

  const provider = new ethers.JsonRpcProvider(config.rpc);
  const node = ethers.namehash(name);

  // Find resolver for this name
  const registry = new ethers.Contract(ENS_SEPOLIA.registry, REGISTRY_ABI, provider);
  const resolverAddr = await registry.resolver(node);

  if (resolverAddr === ethers.ZeroAddress) {
    return { name, address: null, records: {} };
  }

  const resolver = new ethers.Contract(resolverAddr, RESOLVER_ABI, provider);

  const keys = [
    'receipt.pubkey', 'receipt.chainRoot', 'receipt.capabilities',
    'receipt.standard', 'receipt.teeProvider', 'avatar', 'description', 'url',
  ] as const;

  const records: Partial<AgentTextRecords> = {};

  const results = await Promise.allSettled(
    keys.map(key => resolver.text(node, key)),
  );

  for (let i = 0; i < keys.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value) {
      (records as any)[keys[i]] = r.value;
    }
  }

  let address: string | null = null;
  try {
    address = await resolver.addr(node);
    if (address === ethers.ZeroAddress) address = null;
  } catch {}

  return { name, address, records };
}

export { ENS_SEPOLIA };
