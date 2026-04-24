import { createKeeperHubClient } from '../../packages/receipt-sdk/dist/index.js';

async function main() {
  const apiKey = process.env.KEEPERHUB_API_KEY;
  if (!apiKey) {
    console.error('Set KEEPERHUB_API_KEY environment variable');
    process.exit(1);
  }

  const client = createKeeperHubClient({ apiKey });

  const workflowId = process.argv[2];
  if (!workflowId) {
    console.error('Usage: auto-anchor.ts <workflow-id>');
    process.exit(1);
  }

  console.log(`Triggering workflow ${workflowId}...`);
  await client.triggerAnchor(workflowId);
  console.log('✓ Anchor triggered');

  const status = await client.getWorkflowStatus(workflowId);
  console.log(`Workflow status: ${status.status}`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
