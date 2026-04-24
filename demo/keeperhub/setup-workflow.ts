/**
 * setup-workflow.ts — Register the RECEIPT auto-anchor workflow with KeeperHub.
 *
 * This script:
 * 1. Creates a KeeperHub workflow with two nodes:
 *    - Trigger: a webhook that calls our /api/keeperhub endpoint
 *    - Anchor: a web3 contract write to call anchorRoot() on 0G Mainnet
 * 2. Schedules the workflow to run every 10 minutes
 * 3. Prints the workflow ID for use with auto-anchor.ts
 *
 * Usage:
 *   KEEPERHUB_API_KEY=xxx npx tsx demo/keeperhub/setup-workflow.ts
 *
 * Env vars:
 *   KEEPERHUB_API_KEY   — Your KeeperHub API key (required)
 *   WEBHOOK_URL         — Override the default webhook URL
 *   OG_CONTRACT_ADDRESS — 0G Mainnet contract address
 */

import { createKeeperHubClient } from '../../packages/receipt-sdk/dist/index.js';

async function main() {
  const apiKey = process.env.KEEPERHUB_API_KEY;
  if (!apiKey) {
    console.error('Error: Set KEEPERHUB_API_KEY environment variable');
    console.error('  Get one at https://app.keeperhub.xyz');
    process.exit(1);
  }

  const webhookUrl = process.env.WEBHOOK_URL ?? 'https://receipt-ashy.vercel.app/api/keeperhub';
  const contractAddress = process.env.OG_CONTRACT_ADDRESS;

  console.log('Setting up RECEIPT auto-anchor workflow on KeeperHub...');
  console.log(`  Webhook URL: ${webhookUrl}`);
  console.log(`  Contract:    ${contractAddress ?? '(not set)'}`);
  console.log();

  const client = createKeeperHubClient({ apiKey });

  // Build the workflow graph: trigger -> anchor
  const workflow = await client.createWorkflow(
    'RECEIPT Auto-Anchor',
    [
      {
        id: 'trigger',
        type: 'webhook',
        data: {
          url: webhookUrl,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        position: { x: 0, y: 0 },
      },
      {
        id: 'anchor',
        type: 'web3/write-contract',
        data: {
          chain: '0g-mainnet',
          chainId: 16661,
          contract: contractAddress,
          method: 'anchorRoot',
          abi: ['function anchorRoot(bytes32 chainRootHash, bytes32 storageRef) external'],
        },
        position: { x: 300, y: 0 },
      },
    ],
    [{ source: 'trigger', target: 'anchor' }],
  );

  console.log(`Workflow created: ${workflow.id}`);
  console.log(`  Name:   ${workflow.name}`);
  console.log(`  Status: ${workflow.status}`);
  console.log();

  // Schedule: every 10 minutes
  await client.scheduleAnchor(workflow.id, '*/10 * * * *');
  console.log('Schedule set: every 10 minutes (*/10 * * * *)');

  // Verify the workflow is active
  const status = await client.getWorkflowStatus(workflow.id);
  console.log(`Workflow status: ${status.status}`);
  console.log();
  console.log('Next steps:');
  console.log(`  1. Save this workflow ID: ${workflow.id}`);
  console.log('  2. Trigger manually: npx tsx demo/keeperhub/auto-anchor.ts <workflow-id>');
  console.log('  3. Or wait for the 10-minute schedule to fire');
}

main().catch((err) => {
  console.error('Setup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
