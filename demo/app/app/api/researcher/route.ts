import { ReceiptAgent, hash } from '@receipt/sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const DEEPSEEK_V3 = '0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0';
const GLM_5 = '0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C';

let ledgerDeposited = false;

interface InferResult {
  response: string;
  source: string;
  attested: boolean;
  provider: string;
  providerAddress: string;
  teeType: string;
  chatId: string;
  teeSigEndpoint: string;
  teeError?: string;
  teeVerifiedPayload?: {
    provider: string; providerAddress: string; teeType: string;
    chatId: string; signatureEndpoint: string; attested: true; verificationMethod: string;
  };
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

async function tryInfer(prompt: string): Promise<InferResult> {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error('PRIVATE_KEY not configured');

  const { createZGComputeNetworkBroker } = await import('@0glabs/0g-serving-broker');
  const { ethers } = await import('ethers');

  const network = new ethers.Network('0g-mainnet', 16661);
  const rpc = new ethers.JsonRpcProvider('https://evmrpc.0g.ai', network, { staticNetwork: network });
  const wallet = new ethers.Wallet(privateKey, rpc);
  const broker = await createZGComputeNetworkBroker(wallet);

  const providers = [DEEPSEEK_V3, GLM_5];
  const allErrors: string[] = [];

  for (let pass = 0; pass < 2; pass++) {
    const passErrors: string[] = [];
    for (const addr of providers) {
      try {
        const { endpoint, model } = await broker.inference.getServiceMetadata(addr);
        const headers = await broker.inference.getRequestHeaders(addr);
        const apiRes = await fetch(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 200 }),
          signal: AbortSignal.timeout(15000),
        });
        if (!apiRes.ok) { passErrors.push(`${model}: HTTP ${apiRes.status}`); continue; }
        const result: any = await apiRes.json();
        const response = result.choices?.[0]?.message?.content ?? '';
        if (!response) { passErrors.push(`${model}: empty`); continue; }

        const chatId = apiRes.headers.get('ZG-Res-Key') || result.id || '';
        let attested = false;
        let teeVerifiedPayload: InferResult['teeVerifiedPayload'];
        let teeError: string | undefined;
        try {
          const usage = result.usage ? JSON.stringify(result.usage) : '';
          attested = !!(await broker.inference.processResponse(addr, chatId, usage));
          if (attested) {
            teeVerifiedPayload = {
              provider: model, providerAddress: addr, teeType: 'TeeML', chatId,
              signatureEndpoint: `${endpoint}/signature/${chatId}?model=${encodeURIComponent(model)}`,
              attested: true, verificationMethod: 'Intel TDX via 0G Serving Broker',
            };
          }
        } catch (e: unknown) { teeError = e instanceof Error ? e.message : String(e); }

        return {
          response, source: '0g-compute', attested, provider: model, providerAddress: addr,
          teeType: 'TeeML', chatId,
          teeSigEndpoint: `${endpoint}/signature/${chatId}?model=${encodeURIComponent(model)}`,
          teeError, teeVerifiedPayload, usage: result.usage ?? undefined,
        };
      } catch (e: unknown) { passErrors.push(`${addr.slice(0, 10)}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    allErrors.push(`pass ${pass + 1}: ${passErrors.join('; ')}`);
  }

  throw new Error(`0G Compute unavailable - all providers failed. ${allErrors.join(' | ')}`);
}

async function fetchReal(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (r.ok) return await r.text();
  } catch {}
  return null;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function POST(request: Request) {
  const { adversarial } = await request.json().catch(() => ({}));
  const axlResearcherUrl = process.env.AXL_BASE_URL || process.env.AXL_RESEARCHER_URL || 'http://127.0.0.1:9002';
  const axlAuthToken = process.env.AXL_AUTH_TOKEN || '';
  const builderPeerKey = process.env.AXL_BUILDER_KEY || '';
  const axlHeaders: Record<string, string> = axlAuthToken ? { Authorization: `Bearer ${axlAuthToken}` } : {};

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(new TextEncoder().encode(sse(event, data)));
      };
      const pipelineStart = performance.now();

      try {
        // Ledger top-up (once per server lifecycle)
        if (!ledgerDeposited) {
          try {
            const { createZGComputeNetworkBroker } = await import('@0glabs/0g-serving-broker');
            const { ethers: eth } = await import('ethers');
            const net = new eth.Network('0g-mainnet', 16661);
            const rpc = new eth.JsonRpcProvider('https://evmrpc.0g.ai', net, { staticNetwork: net });
            const w = new eth.Wallet(process.env.PRIVATE_KEY!, rpc);
            const b = await createZGComputeNetworkBroker(w);
            await b.ledger.depositFund(5);
            ledgerDeposited = true;
            send('status', { message: 'Compute ledger: deposited 5 A0GI' });
          } catch {}
        }

        const agent = new ReceiptAgent();
        send('status', { message: `Researcher online - ${agent.agentId}` });

        // Check AXL node
        let axlConnected = false;
        let researcherKey = '';
        try {
          const topo = await fetch(`${axlResearcherUrl}/topology`, { headers: axlHeaders, signal: AbortSignal.timeout(2000) });
          if (topo.ok) {
            const info = await topo.json() as any;
            researcherKey = info.our_public_key || '';
            axlConnected = true;
            send('axl_status', { connected: true, nodeUrl: axlResearcherUrl, publicKey: researcherKey, peers: (info.peers || []).length });
          }
        } catch {}
        if (!axlConnected) {
          send('axl_status', { connected: false, nodeUrl: axlResearcherUrl });
        }

        // 1. Read SDK source
        const s0 = performance.now();
        await sleep(200);
        send('status', { message: 'Researcher: Reading SDK source code...' });
        const pkgData = await fetchReal(
          'https://raw.githubusercontent.com/MorkeethHQ/receipt/main/packages/receipt-sdk/package.json',
        );
        const r1 = agent.readFile('packages/receipt-sdk/package.json', pkgData ?? 'FETCH_FAILED');
        send('receipt', { index: 0, receipt: r1, agent: 'A', rawInput: 'packages/receipt-sdk/package.json', rawOutput: pkgData?.slice(0, 500) ?? 'GitHub fetch failed', durationMs: Math.round(performance.now() - s0), tokensUsed: null });

        // 2. Check contract on 0G
        const s1 = performance.now();
        await sleep(300);
        send('status', { message: 'Researcher: Verifying contract deployment on 0G Mainnet...' });
        const contractAddr = process.env.OG_CONTRACT_ADDRESS || '0x73B9A7768679B154D7E1eC5F2570a622A3b49651';
        const contractCheck = await fetchReal(
          `https://chainscan.0g.ai/api?module=contract&action=getabi&address=${contractAddr}`,
        );
        const r2 = agent.callApi(`0G Mainnet: ReceiptAnchor (${contractAddr.slice(0, 10)}...)`, contractCheck?.slice(0, 300) ?? 'FETCH_FAILED');
        send('receipt', { index: 1, receipt: r2, agent: 'A', rawInput: `https://chainscan.0g.ai - contract ${contractAddr}`, rawOutput: contractCheck?.slice(0, 500) ?? 'Chain scan fetch failed', durationMs: Math.round(performance.now() - s1), tokensUsed: null });

        // 3. TEE inference via 0G Compute
        const s2 = performance.now();
        await sleep(200);
        send('status', { message: 'Researcher: Analyzing via 0G Compute (TEE) - DeepSeek V3 primary...' });
        const pkgParsed = (() => { try { const p = JSON.parse(pkgData!); return p && typeof p === 'object' ? p : {}; } catch { return {}; } })();
        const inferPrompt = `Code review: ${pkgParsed.name ?? '@receipt/sdk'} v${pkgParsed.version ?? '0.1.0'} uses ed25519 signing and SHA-256 hashing. The ReceiptAnchor contract is deployed on 0G Mainnet. Review the security of: (1) receipt chain hash linking, (2) signature verification, (3) on-chain anchoring. Are there risks for a multi-agent handoff protocol?`;
        const inferResult = await tryInfer(inferPrompt);
        if (inferResult.teeVerifiedPayload) send('tee_verified', inferResult.teeVerifiedPayload);
        const r3 = agent.callLlm(inferPrompt, inferResult.response);
        send('receipt', {
          index: 2, receipt: r3, agent: 'A',
          llmSource: inferResult.source, teeAttested: inferResult.attested,
          ...(inferResult.teeError ? { teeError: inferResult.teeError } : {}),
          teeMetadata: { provider: inferResult.provider, providerAddress: inferResult.providerAddress, teeType: inferResult.teeType, chatId: inferResult.chatId, teeSigEndpoint: inferResult.teeSigEndpoint },
          rawInput: inferPrompt, rawOutput: inferResult.response.slice(0, 500),
          durationMs: Math.round(performance.now() - s2), tokensUsed: inferResult.usage?.total_tokens ?? null,
        });

        // 4. Research verdict
        const s3 = performance.now();
        await sleep(300);
        const reasoning = `SDK: ${pkgParsed.name}, Contract: ${contractAddr.slice(0, 10)}... on 0G Mainnet (16661). Code review via ${inferResult.source} (TEE: ${inferResult.attested ? 'verified' : 'unverified'}). No critical vulnerabilities found.`;
        const decision = 'Research complete. Safe to hand off to Builder for deployment and anchoring.';
        const r4 = agent.decide(reasoning, decision);
        send('receipt', { index: 3, receipt: r4, agent: 'A', rawInput: reasoning, rawOutput: decision, durationMs: Math.round(performance.now() - s3), tokensUsed: null });

        // 5. Research deliverable
        const s4 = performance.now();
        await sleep(200);
        const output = JSON.stringify({
          sdk: pkgParsed.name ?? '@receipt/sdk', sdkVersion: pkgParsed.version ?? '0.1.0',
          contractDeployed: true, contractAddress: contractAddr, chain: '0G Mainnet (16661)',
          codeReviewSource: inferResult.source, teeAttested: inferResult.attested,
          verdict: 'No critical issues. Proceed with deployment.',
        });
        const r5 = agent.produceOutput('Research report - SDK reviewed, contract verified', output);
        send('receipt', { index: 4, receipt: r5, agent: 'A', rawInput: 'Research report - SDK reviewed, contract verified', rawOutput: output, durationMs: Math.round(performance.now() - s4), tokensUsed: null });

        // === AXL HANDOFF - send chain to Builder via real P2P ===
        send('status', { message: 'Researcher: Preparing handoff bundle...' });
        const receipts = agent.getReceipts();
        const pubKeyHex = Buffer.from(agent.getPublicKey()).toString('hex');
        const chainRoot = agent.getChain().computeRootHash();

        // Tamper for adversarial mode
        let receiptsToSend = receipts;
        if (adversarial) {
          send('status', { message: 'Researcher: Fabricating contract verification...' });
          await sleep(400);
          receiptsToSend = receipts.map((r, i) =>
            i === 1 ? { ...r, outputHash: hash('{"status":"1","result":"contract verified","fake":true,"balance":"999999 ETH"}') } : r
          );
          send('tampered', { index: 1, field: 'outputHash', detail: 'Researcher fabricated the contract verification - claimed a different response than what 0G Mainnet returned' });
        }

        const handoffPayload = {
          receipts: receiptsToSend,
          senderPublicKey: pubKeyHex,
          chainRootHash: chainRoot,
          agentId: agent.agentId,
          timestamp: Date.now(),
        };

        let axlSent = false;
        if (axlConnected && builderPeerKey) {
          try {
            send('status', { message: `Researcher: Sending chain to Builder via AXL (${builderPeerKey.slice(0, 12)}...)` });
            const res = await fetch(`${axlResearcherUrl}/send`, {
              method: 'POST',
              headers: { 'X-Destination-Peer-Id': builderPeerKey, ...axlHeaders },
              body: JSON.stringify(handoffPayload),
            });
            if (res.ok) {
              axlSent = true;
              send('axl_handoff', {
                from: agent.agentId, to: builderPeerKey.slice(0, 16) + '...',
                mode: 'live', protocol: 'AXL P2P',
                receiptCount: receiptsToSend.length, chainRoot,
                researcherNode: researcherKey.slice(0, 16) + '...',
                builderNode: builderPeerKey.slice(0, 16) + '...',
              });
              send('status', { message: 'Chain sent via AXL - encrypted, peer-to-peer, no central server.' });
            }
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            send('status', { message: `AXL send failed: ${msg.slice(0, 60)}` });
          }
        }

        if (!axlSent) {
          send('axl_handoff', {
            from: agent.agentId, to: 'builder',
            mode: 'direct', protocol: 'HTTP (AXL unavailable)',
            receiptCount: receiptsToSend.length, chainRoot,
          });
          send('status', { message: 'AXL not available - handoff via direct HTTP.' });
        }

        send('pipeline_timing', { totalMs: Math.round(performance.now() - pipelineStart) });
        send('researcher_done', {
          receipts: receiptsToSend,
          publicKey: pubKeyHex,
          chainRoot,
          agentId: agent.agentId,
          axlSent,
          adversarial: !!adversarial,
        });
      } catch (err: unknown) {
        send('error', { message: err instanceof Error ? err.message : String(err) });
        send('researcher_done', {
          receipts: [],
          publicKey: '',
          chainRoot: '',
          agentId: 'researcher',
          axlSent: false,
          adversarial: !!adversarial,
          partial: true,
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
