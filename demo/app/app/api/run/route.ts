import { ReceiptAgent, verifyChain, hash } from '@receipt/sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function tryInfer(prompt: string): Promise<{ response: string; source: string; attested: boolean }> {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (res.ok) {
      const data = await res.json();
      return { response: data.response, source: '0g-compute', attested: !!data.attested };
    }
  } catch {}
  return {
    response: 'Analysis: The RECEIPT project implements a cryptographic proof layer using ed25519 signatures and SHA-256 hash chains. The architecture supports multi-agent verification with tamper detection at every step.',
    source: 'simulated',
    attested: false,
  };
}

export async function POST(request: Request) {
  const { adversarial } = await request.json();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(new TextEncoder().encode(sseEvent(event, data)));
      };

      try {
        const agentA = new ReceiptAgent();
        send('status', { message: 'Agent A initialized', agentId: agentA.agentId });

        await sleep(300);
        const r1 = agentA.readFile('README.md', 'R.E.C.E.I.P.T. — Record of Every Computational Event with Immutable Proof and Trust. Proof layer for agent work.');
        send('receipt', { index: 0, receipt: r1, agent: 'A' });

        await sleep(400);
        const r2 = agentA.callApi('https://api.github.com/repos/receipt/info', JSON.stringify({ stars: 42, language: 'TypeScript' }));
        send('receipt', { index: 1, receipt: r2, agent: 'A' });

        await sleep(500);
        send('status', { message: 'Agent A: Requesting 0G Compute TEE inference...' });
        const { response: llmResponse, source, attested } = await tryInfer('Analyze the R.E.C.E.I.P.T. proof layer architecture');
        const r3 = agentA.callLlm('Analyze the R.E.C.E.I.P.T. proof layer architecture', llmResponse);
        send('receipt', { index: 2, receipt: r3, agent: 'A', llmSource: source, teeAttested: attested });

        await sleep(300);
        const r4 = agentA.decide(
          'Strong cryptographic foundation with complete verification pipeline',
          'Proceed with multi-chain anchoring strategy'
        );
        send('receipt', { index: 3, receipt: r4, agent: 'A' });

        await sleep(300);
        const r5 = agentA.produceOutput('Research complete', JSON.stringify({
          recommendation: 'Deploy to 0G Mainnet and Base Sepolia',
          confidence: 0.95,
        }));
        send('receipt', { index: 4, receipt: r5, agent: 'A' });

        let receiptsForVerify = agentA.getReceipts();

        if (adversarial) {
          send('status', { message: '⚠ ADVERSARIAL MODE: Tampering with receipt...' });
          await sleep(500);
          receiptsForVerify = receiptsForVerify.map((r, i) =>
            i === 1 ? { ...r, outputHash: hash('fabricated-data') } : r
          );
          send('tampered', { index: 1, field: 'outputHash' });
        }

        send('status', { message: 'Agent B: Verifying handoff chain...' });
        await sleep(600);

        const results = verifyChain(receiptsForVerify, agentA.getPublicKey());
        for (const result of results) {
          await sleep(200);
          send('verified', { result });
        }

        const allValid = results.every((r) => r.valid);
        send('verification_complete', { valid: allValid, results });

        if (!allValid) {
          send('fabrication_detected', { message: 'FABRICATION DETECTED — Agent B refuses to continue' });
          send('done', { receipts: receiptsForVerify, agentACount: 5, agentBCount: 0, fabricated: true });
          controller.close();
          return;
        }

        await sleep(400);
        send('status', { message: 'Agent B: Chain verified. Building on top...' });

        const agentB = ReceiptAgent.continueFrom(receiptsForVerify);

        await sleep(300);
        const b1 = agentB.readFile('handoff.json', JSON.stringify({ from: agentA.agentId }));
        send('receipt', { index: 5, receipt: b1, agent: 'B' });

        await sleep(400);
        const b2 = agentB.callLlm('Generate implementation plan based on research', 'Plan: 1) Deploy contracts 2) Set up KeeperHub triggers 3) Enable AXL P2P handoffs');
        send('receipt', { index: 6, receipt: b2, agent: 'B' });

        await sleep(300);
        const b3 = agentB.decide('Plan covers all bounty requirements', 'Execute implementation');
        send('receipt', { index: 7, receipt: b3, agent: 'B' });

        await sleep(300);
        const b4 = agentB.produceOutput('Build complete', JSON.stringify({
          contracts: 2, integrations: 3, testsAdded: 8,
        }));
        send('receipt', { index: 8, receipt: b4, agent: 'B' });

        const allReceipts = agentB.getReceipts();
        const rootHash = agentB.getChain().computeRootHash();

        send('done', {
          receipts: allReceipts,
          agentACount: 5,
          agentBCount: 4,
          rootHash,
          fabricated: false,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        send('error', { message: msg });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
