import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const KH_API_BASE = 'https://app.keeperhub.com/api';

export async function POST(request: Request) {
  try {
    const { rootHash, storageRef, chainLength } = await request.json();

    const khApiKey = process.env.KEEPERHUB_API_KEY;
    if (!khApiKey) {
      return NextResponse.json({ error: 'KeeperHub API key not configured' }, { status: 500 });
    }

    const rootHashBytes = rootHash.startsWith('0x') ? rootHash : `0x${rootHash}`;
    const storageRefBytes = storageRef
      ? (storageRef.startsWith('0x') ? storageRef : `0x${storageRef}`)
      : '0x' + '0'.repeat(64);

    // Use KeeperHub's Direct Execution API for contract calls
    // This routes through their execution layer with gas optimization,
    // nonce management, multi-RPC failover, and retry logic
    const khWorkflowId = process.env.KEEPERHUB_ANCHOR_WORKFLOW_ID;

    if (khWorkflowId) {
      // Trigger pre-created webhook workflow
      const webhookKey = process.env.KEEPERHUB_WEBHOOK_KEY;
      const triggerRes = await fetch(`${KH_API_BASE}/workflows/${khWorkflowId}/webhook`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${webhookKey || khApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rootHash: rootHashBytes,
          storageRef: storageRefBytes,
          chainLength: chainLength ?? 0,
          timestamp: Date.now(),
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!triggerRes.ok) {
        const body = await triggerRes.text().catch(() => '');
        return NextResponse.json({
          error: `KeeperHub workflow trigger failed: ${triggerRes.status}`,
          details: body.slice(0, 500),
        }, { status: 502 });
      }

      const triggerResult = await triggerRes.json();
      const executionId = triggerResult.executionId ?? triggerResult.id;

      // Poll for execution status
      let status = 'pending';
      let txHash = '';
      const pollDeadline = Date.now() + 60000;

      while (Date.now() < pollDeadline && !['success', 'error', 'cancelled'].includes(status)) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const statusRes = await fetch(
            `${KH_API_BASE}/workflows/executions/${executionId}/status`,
            { headers: { 'Authorization': `Bearer ${khApiKey}` } },
          );
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            status = statusData.status;
            if (statusData.nodeStatuses) {
              const anchorNode = statusData.nodeStatuses.find(
                (n: any) => n.output?.transactionHash,
              );
              if (anchorNode) txHash = anchorNode.output.transactionHash;
            }
          }
        } catch {}
      }

      return NextResponse.json({
        method: 'keeperhub-workflow',
        executionId,
        status,
        txHash,
        rootHash: rootHashBytes,
        storageRef: storageRefBytes,
      });
    }

    // Fallback: Use KeeperHub's Direct Execution API
    const execRes = await fetch(`${KH_API_BASE}/execute/contract-call`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${khApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        network: 'base',
        contractAddress: process.env.BASE_CONTRACT_ADDRESS,
        functionName: 'anchorRoot',
        functionArgs: [rootHashBytes, storageRefBytes],
        abi: [{
          type: 'function',
          name: 'anchorRoot',
          inputs: [
            { name: 'chainRootHash', type: 'bytes32' },
            { name: 'storageRef', type: 'bytes32' },
          ],
          outputs: [],
          stateMutability: 'nonpayable',
        }],
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!execRes.ok) {
      const body = await execRes.text().catch(() => '');
      return NextResponse.json({
        error: `KeeperHub execution failed: ${execRes.status}`,
        details: body.slice(0, 500),
      }, { status: 502 });
    }

    const execResult = await execRes.json();

    return NextResponse.json({
      method: 'keeperhub-direct-execution',
      executionId: execResult.executionId ?? execResult.id,
      txHash: execResult.transactionHash ?? '',
      status: execResult.status ?? 'submitted',
      rootHash: rootHashBytes,
      storageRef: storageRefBytes,
      gasOptimized: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  const khApiKey = process.env.KEEPERHUB_API_KEY;
  if (!khApiKey) {
    return NextResponse.json({
      status: 'not_configured',
      message: 'Set KEEPERHUB_API_KEY env var',
    });
  }

  try {
    const res = await fetch(`${KH_API_BASE}/workflows`, {
      headers: { 'Authorization': `Bearer ${khApiKey}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json({ status: 'error', httpStatus: res.status });
    }

    const workflows = await res.json();
    return NextResponse.json({
      status: 'connected',
      workflows: Array.isArray(workflows) ? workflows.length : 0,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: 'error', message: msg });
  }
}
