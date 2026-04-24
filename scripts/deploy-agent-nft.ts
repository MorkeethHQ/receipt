import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import solc from 'solc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractPath = path.join(__dirname, '..', 'contracts', 'AgentNFT.sol');
const source = fs.readFileSync(contractPath, 'utf-8');

const input = {
  language: 'Solidity',
  sources: { 'AgentNFT.sol': { content: source } },
  settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors?.some((e: any) => e.severity === 'error')) {
  console.error('Compilation errors:');
  output.errors.forEach((e: any) => console.error(e.formattedMessage));
  process.exit(1);
}

const contract = output.contracts['AgentNFT.sol']['AgentNFT'];
const abi = contract.abi;
const bytecode = contract.evm.bytecode.object;

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Set PRIVATE_KEY environment variable');
    process.exit(1);
  }

  const rpc = process.argv[2] || 'https://evmrpc.0g.ai';
  const chainId = parseInt(process.argv[3] || '16661');
  const chainName = chainId === 16661 ? '0G Mainnet' : `Chain ${chainId}`;

  console.log(`=== RECEIPT: AgentNFT (ERC-7857) Deployment ===`);
  console.log(`Chain:    ${chainName} (${chainId})`);
  console.log(`RPC:      ${rpc}`);
  console.log(`Bytecode: ${bytecode.length / 2} bytes\n`);

  const network = new ethers.Network(chainName, chainId);
  const provider = new ethers.JsonRpcProvider(rpc, network, { staticNetwork: true });
  const wallet = new ethers.Wallet(privateKey, provider);

  const balance = await provider.getBalance(wallet.address);
  console.log(`Wallet:   ${wallet.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    console.error('\nNo balance — fund the wallet first');
    process.exit(1);
  }

  console.log('\nDeploying...');
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const deployed = await factory.deploy();
  await deployed.waitForDeployment();

  const address = await deployed.getAddress();
  console.log(`\n✓ AgentNFT deployed: ${address}`);
  console.log(`\nSet in your .env:`);
  console.log(`  AGENT_NFT_ADDRESS=${address}`);

  // Verify by reading name
  const nft = new ethers.Contract(address, abi, provider);
  const name = await nft.name();
  const symbol = await nft.symbol();
  console.log(`\nVerified: ${name} (${symbol})`);
}

main().catch(console.error);
