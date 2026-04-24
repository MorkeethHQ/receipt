import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { join } from 'path';

const BUILD_DIR = join(__dirname, '..', 'contracts', 'build');

async function deploy(name: string, wallet: ethers.Wallet) {
  const abiFile = `contracts_${name}_sol_${name}.abi`;
  const binFile = `contracts_${name}_sol_${name}.bin`;

  const abi = JSON.parse(readFileSync(join(BUILD_DIR, abiFile), 'utf-8'));
  const bytecode = '0x' + readFileSync(join(BUILD_DIR, binFile), 'utf-8').trim();

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  console.log(`Deploying ${name}...`);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`${name} deployed at: ${address}`);
  return address;
}

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) { console.error('Set PRIVATE_KEY env var'); process.exit(1); }

  const network = new ethers.Network('0g-mainnet', 16661);
  const provider = new ethers.JsonRpcProvider('https://evmrpc.0g.ai', network, { staticNetwork: network });
  const wallet = new ethers.Wallet(pk, provider);

  console.log(`Wallet: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} 0G`);

  if (balance === 0n) {
    console.error('No balance — need 0G tokens for gas');
    process.exit(1);
  }

  const anchorAddr = await deploy('ReceiptAnchor', wallet);
  const nftAddr = await deploy('AgentNFT', wallet);

  console.log('\n--- DEPLOYED ---');
  console.log(`ReceiptAnchor: ${anchorAddr}`);
  console.log(`AgentNFT:      ${nftAddr}`);
  console.log(`Chain:         0G Mainnet (16661)`);
  console.log(`Explorer:      https://chainscan.0g.ai/address/${anchorAddr}`);
  console.log(`Explorer:      https://chainscan.0g.ai/address/${nftAddr}`);
}

main().catch(console.error);
