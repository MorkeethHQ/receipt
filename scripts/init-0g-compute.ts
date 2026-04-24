import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker';
import { ethers } from 'ethers';

const PROVIDERS = [
  { addr: '0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C', name: 'GLM-5' },
  { addr: '0xBB3f5b0b5062CB5B3245222C5917afD1f6e13aF6', name: 'GPT-oss-120B' },
  { addr: '0x25F8f01cA76060ea40895472b1b79f76613Ca497', name: 'GPT-5.4-mini' },
];

const TRANSFER_AMOUNT = 500000000000000n; // 0.0005 A0GI in neuron (wei)

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) { console.error('Set PRIVATE_KEY env var'); process.exit(1); }

  const network = new ethers.Network('0g-mainnet', 16661);
  const provider = new ethers.JsonRpcProvider('https://evmrpc.0g.ai', network, { staticNetwork: network });
  const wallet = new ethers.Wallet(pk, provider);

  console.log(`Wallet: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} A0GI`);

  console.log('\nInitializing broker...');
  const broker = await createZGComputeNetworkBroker(wallet);

  // Step 1: Check if ledger exists, create if not
  try {
    const ledger = await broker.ledger.getLedger();
    console.log(`Ledger exists. Balance: ${ledger.balance?.toString()}`);
  } catch {
    console.log('No ledger found. Creating with 0.1 A0GI...');
    await broker.ledger.addLedger(0.1);
    console.log('Ledger created.');
  }

  // Step 2: Transfer funds to each provider
  for (const p of PROVIDERS) {
    console.log(`\nTransferring to ${p.name} (${p.addr})...`);
    try {
      await broker.ledger.transferFund(p.addr, 'inference', TRANSFER_AMOUNT);
      console.log(`  OK — ${p.name} sub-account initialized`);
    } catch (e: any) {
      console.error(`  FAILED — ${e.message}`);
    }
  }

  // Step 3: Verify
  console.log('\nChecking provider balances...');
  try {
    const providers = await broker.ledger.getProvidersWithBalance('inference');
    for (const [addr, bal, pending] of providers) {
      const name = PROVIDERS.find(p => p.addr.toLowerCase() === addr.toLowerCase())?.name ?? addr;
      console.log(`  ${name}: balance=${bal.toString()}, pending=${pending.toString()}`);
    }
  } catch (e: any) {
    console.error(`  Could not fetch balances: ${e.message}`);
  }

  console.log('\nDone. Try the inference endpoint now.');
}

main().catch(console.error);
