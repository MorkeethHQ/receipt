/**
 * auto-anchor.ts — Manually trigger the RECEIPT auto-anchor workflow on KeeperHub.
 *
 * This is useful for:
 *  - Testing the workflow without waiting for the cron schedule
 *  - Forcing an immediate anchor after a batch of agent work completes
 *  - CI/CD pipelines that want to anchor after deployment
 *
 * Usage:
 *   KEEPERHUB_API_KEY=xxx npx tsx demo/keeperhub/auto-anchor.ts <workflow-id>
 *
 * Optionally pass --poll to wait for execution to complete:
 *   KEEPERHUB_API_KEY=xxx npx tsx demo/keeperhub/auto-anchor.ts <workflow-id> --poll
 */

import { createKeeperHubClient } from '../../packages/receipt-sdk/dist/index.js';

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20;

async function main() {
  const apiKey = process.env.KEEPERHUB_API_KEY;
  if (!apiKey) {
    console.error('Error: Set KEEPERHUB_API_KEY environment variable');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const workflowId = args.find((a) => !a.startsWith('--'));
  const shouldPoll = args.includes('--poll');

  if (!workflowId) {
    console.error('Usage: auto-anchor.ts <workflow-id> [--poll]');
    console.error();
    console.error('Options:');
    console.error('  --poll   Wait for execution to complete and print results');
    process.exit(1);
  }

  const client = createKeeperHubClient({ apiKey });

  // Check workflow exists and is active
  const status = await client.getWorkflowStatus(workflowId);
  console.log(`Workflow: ${status.name} (${status.status})`);

  if (status.status !== 'active') {
    console.warn(`Warning: Workflow status is "${status.status}", triggering anyway`);
  }

  // Trigger
  console.log('Triggering anchor...');
  await client.triggerAnchor(workflowId);
  console.log('Anchor triggered');

  // Optionally poll for completion
  if (shouldPoll) {
    console.log('Waiting for execution to complete...');
    let attempts = 0;
    while (attempts < POLL_MAX_ATTEMPTS) {
      await sleep(POLL_INTERVAL_MS);
      const current = await client.getWorkflowStatus(workflowId);
      if (current.status === 'completed' || current.status === 'active') {
        console.log(`Execution complete (status: ${current.status})`);
        break;
      }
      if (current.status === 'failed' || current.status === 'error') {
        console.error(`Execution failed (status: ${current.status})`);
        process.exit(1);
      }
      attempts++;
      console.log(`  ...still running (attempt ${attempts}/${POLL_MAX_ATTEMPTS})`);
    }
    if (attempts >= POLL_MAX_ATTEMPTS) {
      console.warn('Timed out waiting for execution. Check KeeperHub dashboard.');
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
