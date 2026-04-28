import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import solc from 'solc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractPath = path.join(__dirname, '..', 'contracts', 'ReceiptAnchorV2.sol');
const source = fs.readFileSync(contractPath, 'utf-8');

const input = {
  language: 'Solidity',
  sources: { 'ReceiptAnchorV2.sol': { content: source } },
  settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors?.some((e: any) => e.severity === 'error')) {
  console.error('Compilation errors:');
  output.errors.forEach((e: any) => console.error(e.formattedMessage));
  process.exit(1);
}

const contract = output.contracts['ReceiptAnchorV2.sol']['ReceiptAnchorV2'];
const abi = contract.abi;
const bytecode = contract.evm.bytecode.object;

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Set PRIVATE_KEY environment variable');
    process.exit(1);
  }

  console.log('=== RECEIPT: ReceiptAnchorV2 Deployment ===');
  console.log(`Compiled ReceiptAnchorV2.sol (${bytecode.length / 2} bytes)`);
  console.log('New: anchorRoot now stores usefulnessScore (0-100) on-chain\n');

  const network = new ethers.Network('0g-mainnet', 16661);
  const provider = new ethers.JsonRpcProvider('https://evmrpc.0g.ai', network, { staticNetwork: network });
  const wallet = new ethers.Wallet(privateKey, provider);

  const balance = await provider.getBalance(wallet.address);
  console.log(`Wallet: ${wallet.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)}`);

  if (balance === 0n) {
    console.log('No balance — cannot deploy');
    process.exit(1);
  }

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const deployed = await factory.deploy();
  await deployed.waitForDeployment();

  const address = await deployed.getAddress();
  console.log(`\n✓ ReceiptAnchorV2 deployed: ${address}`);
  console.log(`  Explorer: https://chainscan.0g.ai/address/${address}`);
  console.log('\nUpdate OG_CONTRACT_ADDRESS in .env to use V2');
}

main().catch(console.error);
