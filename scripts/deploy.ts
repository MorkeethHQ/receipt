import { ethers } from 'ethers';
import * as fs from 'fs';

const RECEIPT_ANCHOR_BYTECODE = '0x608060405234801561001057600080fd5b50610282806100206000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c80631cb8284e1461003b578063c2bc2efc14610050575b600080fd5b61004e6100493660046101d4565b610080565b005b61006c61005e3660046101f6565b60006020819052908152604090205460ff1690565b604051901515815260200160405180910390f35b60008281526020819052604090205460ff16156100e45760405162461bcd60e51b815260206004820152601060248201527f416c726561647920616e63686f7265640000000000000000000000000000000060448201526064015b60405180910390fd5b6000828152602081905260409020805460ff191660011790556040514290339084907f8a41e0c71bc929980d0b4a9cc2f6c4c9e0b5a58c60f9e0c5a0e5e0c9eae5b0da9061013490879061020f565b60405180910390a45050565b634e487b7160e01b600052604160045260246000fd5b600082601f83011261016757600080fd5b813567ffffffffffffffff8082111561018257610182610140565b604051601f8301601f19908116603f011681019082821181831017156101aa576101aa610140565b816040528381528660208588010111156101c357600080fd5b836020870160208301376000602085830101528094505050505092915050565b600080604083850312156101e757600080fd5b50508035926020909101359150565b60006020828403121561020857600080fd5b5035919050565b90815260200190565b';

const RECEIPT_ANCHOR_ABI = [
  'function anchorRoot(bytes32 chainRootHash, bytes32 storageRef) external',
  'function isAnchored(bytes32 chainRootHash) external view returns (bool)',
  'event RootAnchored(bytes32 indexed chainRootHash, bytes32 storageRef, address indexed sender, uint256 timestamp)',
];

interface ChainConfig {
  name: string;
  rpc: string;
  chainId: number;
}

const CHAINS: ChainConfig[] = [
  { name: '0G Mainnet', rpc: 'https://evmrpc.0g.ai', chainId: 16661 },
  { name: 'Base Sepolia', rpc: 'https://sepolia.base.org', chainId: 84532 },
];

async function deploy(chain: ChainConfig, privateKey: string) {
  console.log(`\nDeploying to ${chain.name} (chain ID: ${chain.chainId})...`);

  const provider = new ethers.JsonRpcProvider(chain.rpc, undefined, { staticNetwork: true });
  const wallet = new ethers.Wallet(privateKey, provider);

  const balance = await provider.getBalance(wallet.address);
  console.log(`  Wallet: ${wallet.address}`);
  console.log(`  Balance: ${ethers.formatEther(balance)} ETH`);

  const factory = new ethers.ContractFactory(RECEIPT_ANCHOR_ABI, RECEIPT_ANCHOR_BYTECODE, wallet);
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`  Contract deployed: ${address}`);

  return address;
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Set PRIVATE_KEY environment variable');
    process.exit(1);
  }

  const chain = process.argv[2];
  const targets = chain
    ? CHAINS.filter((c) => c.name.toLowerCase().includes(chain.toLowerCase()))
    : CHAINS;

  if (targets.length === 0) {
    console.error(`Unknown chain: ${chain}`);
    console.error(`Available: ${CHAINS.map((c) => c.name).join(', ')}`);
    process.exit(1);
  }

  const addresses: Record<string, string> = {};
  for (const target of targets) {
    try {
      addresses[target.name] = await deploy(target, privateKey);
    } catch (err: any) {
      console.error(`  Failed: ${err.message}`);
    }
  }

  console.log('\n=== Deployment Summary ===');
  for (const [name, addr] of Object.entries(addresses)) {
    console.log(`  ${name}: ${addr}`);
  }
}

main().catch(console.error);
