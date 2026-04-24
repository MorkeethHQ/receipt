/**
 * One-time script: Register a parent ENS name on Sepolia.
 *
 * Usage:
 *   ENS_NAME=receiptagent npx tsx scripts/register-ens-parent.ts
 *
 * Prerequisites:
 *   - PRIVATE_KEY in .env
 *   - Sepolia ETH in the wallet (get free from https://sepoliafaucet.com)
 *   - ~65 seconds wait between commit and register (ENS commit-reveal scheme)
 */

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

const SEPOLIA_RPC = process.env.SEPOLIA_RPC || 'https://rpc.sepolia.org';
const ENS_REGISTRAR = '0xFEd6a969AaA60E4961FCD3EBF1A2e8913BAe6060';
const PUBLIC_RESOLVER = '0x8FADE66B79cC9f1C6F971901BaD22D47e458cE24';

const ABI = [
  'function available(string name) external view returns (bool)',
  'function makeCommitment(string name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] calldata data, bool reverseRecord, uint16 ownerControlledFuses) external pure returns (bytes32)',
  'function commit(bytes32 commitment) external',
  'function register(string name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] calldata data, bool reverseRecord, uint16 ownerControlledFuses) external payable',
  'function rentPrice(string name, uint256 duration) external view returns (uint256 base, uint256 premium)',
];

async function main() {
  const name = process.env.ENS_NAME || 'receiptagent';
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error('Set PRIVATE_KEY in .env');

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const wallet = new ethers.Wallet(pk, provider);
  const controller = new ethers.Contract(ENS_REGISTRAR, ABI, wallet);

  console.log(`Wallet: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

  const isAvailable = await controller.available(name);
  if (!isAvailable) {
    console.log(`"${name}.eth" is NOT available — already registered.`);
    console.log(`Node: ${ethers.namehash(`${name}.eth`)}`);
    console.log('Add to .env:');
    console.log(`ENS_PARENT_NAME=${name}.eth`);
    return;
  }

  console.log(`"${name}.eth" is available. Starting registration...`);

  const duration = 365 * 24 * 3600;
  const secret = ethers.hexlify(ethers.randomBytes(32));
  const data: string[] = [];

  console.log('Step 1: Making commitment...');
  const commitment = await controller.makeCommitment(
    name, wallet.address, duration, secret,
    PUBLIC_RESOLVER, data, false, 0,
  );

  const commitTx = await controller.commit(commitment);
  console.log(`  Commit tx: ${commitTx.hash}`);
  await commitTx.wait();
  console.log('  Committed.');

  console.log('Step 2: Waiting 65 seconds for commit-reveal...');
  for (let i = 65; i > 0; i -= 5) {
    process.stdout.write(`  ${i}s remaining...\r`);
    await new Promise(r => setTimeout(r, 5000));
  }
  console.log('  Wait complete.');

  console.log('Step 3: Checking price...');
  const [base, premium] = await controller.rentPrice(name, duration);
  const price = base + premium;
  console.log(`  Price: ${ethers.formatEther(price)} ETH`);

  console.log('Step 4: Registering...');
  const registerTx = await controller.register(
    name, wallet.address, duration, secret,
    PUBLIC_RESOLVER, data, false, 0,
    { value: price * 110n / 100n },
  );
  console.log(`  Register tx: ${registerTx.hash}`);
  const receipt = await registerTx.wait();
  console.log(`  Registered in block ${receipt.blockNumber}`);

  const node = ethers.namehash(`${name}.eth`);
  console.log(`\nSuccess! "${name}.eth" registered.`);
  console.log(`  Node: ${node}`);
  console.log(`  Owner: ${wallet.address}`);
  console.log(`\nAdd to .env:`);
  console.log(`  ENS_PARENT_NAME=${name}.eth`);
  console.log(`  SEPOLIA_RPC=${SEPOLIA_RPC}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
