import { createKeeperHubClient } from '../../packages/receipt-sdk/dist/index.js';

async function main() {
  const apiKey = process.env.KEEPERHUB_API_KEY;
  if (!apiKey) {
    console.error('Set KEEPERHUB_API_KEY environment variable');
    process.exit(1);
  }

  const webhookUrl = process.env.WEBHOOK_URL ?? 'https://receipt-ashy.vercel.app/api/keeperhub';

  const client = createKeeperHubClient({ apiKey });

  const workflow = await client.createWorkflow(
    'RECEIPT Auto-Anchor',
    [
      {
        id: 'trigger',
        type: 'webhook',
        data: { url: webhookUrl, method: 'POST' },
      },
      {
        id: 'anchor',
        type: 'web3/write-contract',
        data: {
          chain: '0g-mainnet',
          contract: process.env.OG_CONTRACT_ADDRESS,
          method: 'anchorRoot',
        },
      },
    ],
    [{ source: 'trigger', target: 'anchor' }],
  );

  console.log(`Workflow created: ${workflow.id}`);

  await client.scheduleAnchor(workflow.id, '*/10 * * * *');
  console.log('Scheduled: every 10 minutes');

  const status = await client.getWorkflowStatus(workflow.id);
  console.log(`Status: ${status.status}`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
