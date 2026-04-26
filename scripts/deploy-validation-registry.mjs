import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const ABI = JSON.parse(readFileSync(new URL('../contracts/build/ValidationRegistry_sol_ValidationRegistry.abi', import.meta.url), 'utf8'));
const BYTECODE = '0x' + readFileSync(new URL('../contracts/build/ValidationRegistry_sol_ValidationRegistry.bin', import.meta.url), 'utf8').trim();

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Set PRIVATE_KEY environment variable');
    process.exit(1);
  }

  console.log('=== RECEIPT: ERC-8004 ValidationRegistry Deployment ===\n');

  const network = new ethers.Network('0g-mainnet', 16661);
  const provider = new ethers.JsonRpcProvider('https://evmrpc.0g.ai', network, { staticNetwork: network });
  const wallet = new ethers.Wallet(privateKey, provider);

  const balance = await provider.getBalance(wallet.address);
  console.log(`Wallet:  ${wallet.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} A0GI\n`);

  if (balance === 0n) {
    console.error('No balance — cannot deploy');
    process.exit(1);
  }

  console.log('Deploying ValidationRegistry (ERC-8004)...');
  const factory = new ethers.ContractFactory(ABI, BYTECODE, wallet);
  const deployed = await factory.deploy();
  const tx = deployed.deploymentTransaction();
  console.log(`  tx: ${tx?.hash}`);

  await deployed.waitForDeployment();
  const address = await deployed.getAddress();

  console.log(`\n✓ ValidationRegistry deployed at: ${address}`);
  console.log(`  Explorer: https://chainscan-newton.0g.ai/address/${address}`);
  console.log(`\nUpdate your .env.local:`);
  console.log(`  VALIDATION_REGISTRY_ADDRESS=${address}`);
}

main().catch(err => {
  console.error('Deploy failed:', err.message || err);
  process.exit(1);
});
