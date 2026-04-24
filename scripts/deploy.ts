import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import solc from 'solc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractPath = path.join(__dirname, '..', 'contracts', 'ReceiptAnchor.sol');
const source = fs.readFileSync(contractPath, 'utf-8');

const input = {
  language: 'Solidity',
  sources: { 'ReceiptAnchor.sol': { content: source } },
  settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors?.some((e: any) => e.severity === 'error')) {
  console.error('Compilation errors:');
  output.errors.forEach((e: any) => console.error(e.formattedMessage));
  process.exit(1);
}

const contract = output.contracts['ReceiptAnchor.sol']['ReceiptAnchor'];
const abi = contract.abi;
const bytecode = contract.evm.bytecode.object;

interface ChainConfig {
  name: string;
  rpc: string;
  chainId: number;
}

const CHAINS: ChainConfig[] = [
  { name: '0G Mainnet', rpc: 'https://evmrpc.0g.ai', chainId: 16661 },
];

async function deploy(chain: ChainConfig, privateKey: string) {
  console.log(`\nDeploying to ${chain.name} (chain ID: ${chain.chainId})...`);

  const provider = new ethers.JsonRpcProvider(chain.rpc, undefined, { staticNetwork: true });
  const wallet = new ethers.Wallet(privateKey, provider);

  const balance = await provider.getBalance(wallet.address);
  console.log(`  Wallet: ${wallet.address}`);
  console.log(`  Balance: ${ethers.formatEther(balance)}`);

  if (balance === 0n) {
    console.log(`  Skipping — no balance`);
    return null;
  }

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const deployed = await factory.deploy();
  await deployed.waitForDeployment();

  const address = await deployed.getAddress();
  console.log(`  ✓ Contract deployed: ${address}`);
  return address;
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Set PRIVATE_KEY environment variable');
    process.exit(1);
  }

  console.log('=== RECEIPT: Contract Deployment ===');
  console.log(`Compiled ReceiptAnchor.sol (${bytecode.length / 2} bytes)`);

  const target = process.argv[2];
  const targets = target
    ? CHAINS.filter((c) => c.name.toLowerCase().includes(target.toLowerCase()))
    : CHAINS;

  const addresses: Record<string, string> = {};
  for (const chain of targets) {
    try {
      const addr = await deploy(chain, privateKey);
      if (addr) addresses[chain.name] = addr;
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
