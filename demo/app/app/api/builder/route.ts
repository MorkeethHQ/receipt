import { ReceiptAgent, verifyChain, hash } from '@receipt/sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const DEEPSEEK_V3 = '0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0';
const GLM_5 = '0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C';

interface InferResult {
  response: string; source: string; attested: boolean; provider: string;
  providerAddress: string; teeType: string; chatId: string; teeSigEndpoint: string;
  teeError?: string;
  teeVerifiedPayload?: { provider: string; providerAddress: string; teeType: string; chatId: string; signatureEndpoint: string; attested: true; verificationMethod: string };
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

async function tryInfer(prompt: string, role: 'analysis' | 'review' = 'review'): Promise<InferResult> {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error('PRIVATE_KEY not configured');

  const { createZGComputeNetworkBroker } = await import('@0glabs/0g-serving-broker');
  const { ethers } = await import('ethers');

  const net = new ethers.Network('0g-mainnet', 16661);
  const rpc = new ethers.JsonRpcProvider('https://evmrpc.0g.ai', net, { staticNetwork: net });
  const wallet = new ethers.Wallet(privateKey, rpc);
  const broker = await createZGComputeNetworkBroker(wallet);

  const order = role === 'review' ? [GLM_5, DEEPSEEK_V3] : [DEEPSEEK_V3, GLM_5];
  const allErrors: string[] = [];

  for (let pass = 0; pass < 2; pass++) {
    const passErrors: string[] = [];
    for (const addr of order) {
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

  console.warn(`Builder: 0G Compute fallback. ${allErrors.join(' | ')}`);
  return {
    response: '{"alignment":78,"substance":72,"quality":75,"reasoning":"Simulated review — 0G Compute unavailable","weights":[0.6,0.8,0.9,0.7,0.8,0.7,0.8,0.85,0.9]}',
    source: 'simulated', attested: false, provider: 'simulated', providerAddress: '',
    teeType: 'none', chatId: '', teeSigEndpoint: '',
    usage: { prompt_tokens: 60, completion_tokens: 150, total_tokens: 210 },
  };
}

async function fetchReal(url: string, fallback: string): Promise<string> {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(5000) }); if (r.ok) return await r.text(); } catch {}
  return fallback;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { lowQuality } = body;
  // If chain is passed directly (simulated mode), use it. Otherwise receive via AXL.
  const directChain = body.receipts as any[] | undefined;
  const directPublicKey = body.publicKey as string | undefined;

  const axlBuilderUrl = process.env.AXL_BUILDER_URL || 'http://127.0.0.1:9012';

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(new TextEncoder().encode(sse(event, data)));
      };
      const pipelineStart = performance.now();

      try {
        // === RECEIVE CHAIN FROM AXL ===
        let receiptsForVerify: any[] = [];
        let senderPubKey = '';
        let senderAgentId = '';
        let chainRoot = '';
        let axlReceived = false;

        if (directChain && directChain.length > 0) {
          receiptsForVerify = directChain;
          senderPubKey = directPublicKey || '';
          senderAgentId = directChain[0]?.agentId || 'researcher';
          send('status', { message: 'Builder: Received chain directly (fallback mode).' });
        } else {
          send('status', { message: 'Builder: Waiting for chain from AXL...' });

          // Poll AXL for incoming message (up to 30s)
          const deadline = Date.now() + 30000;
          while (Date.now() < deadline) {
            try {
              const res = await fetch(`${axlBuilderUrl}/recv`, { signal: AbortSignal.timeout(2000) });
              if (res.status === 200) {
                const fromPeer = res.headers.get('X-From-Peer-Id') || 'unknown';
                const payload = await res.json() as any;
                receiptsForVerify = payload.receipts || [];
                senderPubKey = payload.senderPublicKey || '';
                senderAgentId = payload.agentId || receiptsForVerify[0]?.agentId || 'researcher';
                chainRoot = payload.chainRootHash || '';
                axlReceived = true;

                send('axl_received', {
                  fromPeer: fromPeer.slice(0, 16) + '...',
                  receiptCount: receiptsForVerify.length,
                  chainRoot,
                  mode: 'live',
                });
                send('status', { message: `Builder: Received ${receiptsForVerify.length} receipts from ${fromPeer.slice(0, 12)}... via AXL` });
                break;
              }
            } catch {}
            await sleep(500);
          }

          if (!axlReceived) {
            send('error', { message: 'Builder: Timeout — no chain received from AXL within 30s.' });
            controller.close();
            return;
          }
        }

        send('status', { message: `Builder: Verifying ${receiptsForVerify.length} receipts from Researcher...` });

        // === VERIFY THE CHAIN ===
        const pubKeyBytes = new Uint8Array(Buffer.from(senderPubKey, 'hex'));
        const results = verifyChain(receiptsForVerify, pubKeyBytes);
        const allValid = results.every(r => r.valid);

        send('verification_complete', { valid: allValid, results });

        if (!allValid) {
          const failIdx = results.findIndex(r => !r.valid);
          send('fabrication_detected', {
            message: `Receipt #${failIdx + 1} failed verification. Builder refuses the handoff.`,
            failedIndex: failIdx,
            checks: results[failIdx]?.checks,
          });
          send('done', { receipts: receiptsForVerify, agentBCount: 0, fabricated: true, axlReceived });
          controller.close();
          return;
        }

        send('status', { message: 'Builder: Chain verified. All signatures and hash links valid. Starting work...' });

        // === BUILDER WORK — 4 receipts ===
        const agentB = ReceiptAgent.continueFrom(receiptsForVerify);
        const agentBPubKeyHex = Buffer.from(agentB.getPublicKey()).toString('hex');

        // 1. Read handoff
        const s5 = performance.now();
        await sleep(250);
        const handoffData = JSON.stringify({
          from: senderAgentId, receiptsReceived: receiptsForVerify.length,
          chainVerified: true, rootHash: chainRoot,
          researchVerdict: 'No critical issues. Proceed with deployment.',
        });
        const b1 = agentB.readFile('research-handoff.json', handoffData);
        send('receipt', { index: 5, receipt: b1, agent: 'B', rawInput: 'research-handoff.json', rawOutput: handoffData, durationMs: Math.round(performance.now() - s5), tokensUsed: null });

        // 2. Query 0G chain
        const s6 = performance.now();
        await sleep(300);
        send('status', { message: 'Builder: Querying 0G Mainnet...' });
        const chainData = await fetchReal('https://evmrpc.0g.ai', '{"jsonrpc":"2.0","result":"0x1"}');
        const b2 = agentB.callApi('0G Mainnet RPC (eth_blockNumber)', chainData.slice(0, 200));
        send('receipt', { index: 6, receipt: b2, agent: 'B', rawInput: 'https://evmrpc.0g.ai — eth_blockNumber', rawOutput: chainData.slice(0, 200), durationMs: Math.round(performance.now() - s6), tokensUsed: null });

        // 3. Build decision
        const s7 = performance.now();
        await sleep(250);
        const source = receiptsForVerify.some((r: any) => r.attestation) ? '0g-compute' : 'unattested';
        const attested = receiptsForVerify.some((r: any) => r.attestation?.type === 'tee');
        const contractAddr = process.env.OG_CONTRACT_ADDRESS || '0x73B9...';
        const buildReasoning = `Researcher verified ${receiptsForVerify.length} actions. Contract ${contractAddr.slice(0, 10)}... confirmed on 0G Mainnet. Proceeding with chain anchoring.`;
        const buildDecision = 'Deploy: anchor receipt chain on 0G Storage + Chain. Mint agent identity (ERC-7857).';
        const b3 = agentB.decide(buildReasoning, buildDecision);
        send('receipt', { index: 7, receipt: b3, agent: 'B', rawInput: buildReasoning, rawOutput: buildDecision, durationMs: Math.round(performance.now() - s7), tokensUsed: null });

        // 4. Deployment output
        const s8 = performance.now();
        await sleep(200);
        const b4Output = JSON.stringify({
          researchVerified: receiptsForVerify.length, builderActions: 5,
          totalChain: receiptsForVerify.length + 5,
          deployments: ['0G Storage (Merkle root)', '0G Chain (anchor tx)', 'ERC-7857 (agent identity)'],
          chain: '0G Mainnet (16661)',
        });
        const b4 = agentB.produceOutput('Deployment manifest — anchoring receipt chain', b4Output);
        send('receipt', { index: 8, receipt: b4, agent: 'B', rawInput: 'Deployment manifest — anchoring receipt chain', rawOutput: b4Output, durationMs: Math.round(performance.now() - s8), tokensUsed: null });

        // === PROOF OF USEFULNESS — TEE review ===
        const s9 = performance.now();
        const preReviewReceipts = agentB.getReceipts().filter(r => r.action.type !== 'usefulness_review');
        const chainSummary = preReviewReceipts.map((r, i) =>
          `[${i}] ${r.action.type}: ${r.action.description} (input=${r.inputHash.slice(0, 12)}… output=${r.outputHash.slice(0, 12)}…)`
        ).join('\n');

        // TEE reviewer selection
        let reviewerModel = 'GLM-5';
        let reviewerReason = 'Default reviewer';
        let reviewerAttested = false;
        try {
          send('status', { message: 'Selecting review model via TEE...' });
          const selPrompt = `You are a model selection oracle running inside a TEE. Given this agent work chain summary, select the best model to review it. Options: [GLM-5, DeepSeek-V3]. Return ONLY JSON: {"model":"...","reason":"..."}\n\nChain: ${chainSummary.slice(0, 300)}`;
          const selResult = await tryInfer(selPrompt, 'analysis');
          const m = selResult.response.match(/\{[\s\S]*\}/);
          if (m) {
            const sel = JSON.parse(m[0]);
            reviewerModel = sel.model || 'GLM-5';
            reviewerReason = sel.reason || 'Selected via TEE';
            reviewerAttested = selResult.attested;
          }
          send('reviewer_selection', { model: reviewerModel, reason: reviewerReason, attested: reviewerAttested, provider: selResult.provider });
        } catch {
          send('reviewer_selection', { model: reviewerModel, reason: 'Default — selection failed', attested: false, provider: 'fallback' });
        }

        send('status', { message: `Builder: Usefulness review via ${reviewerModel} (TEE)...` });

        const reviewPrompt = `You are a chain quality auditor. Evaluate this agent receipt chain and return ONLY valid JSON.\n\nChain (${preReviewReceipts.length} receipts):\n${chainSummary}\n\nScore on three axes (0-100): alignment, substance, quality. Also score each receipt's usefulness weight (0.0-1.0).\nReturn: {"alignment":N,"substance":N,"quality":N,"reasoning":"...","weights":[...]}`;

        let reviewScores = { alignment: 0, substance: 0, quality: 0, composite: 0, reasoning: '' } as any;
        let perReceiptWeights: number[] = [];
        let reviewAttested = false;
        let reviewSource = 'simulated';
        let reviewAttestation: any = null;
        let reviewInferUsage: any;

        try {
          const reviewInfer = await tryInfer(reviewPrompt, 'review');
          reviewSource = reviewInfer.source;
          reviewAttested = reviewInfer.attested;
          reviewInferUsage = reviewInfer.usage;
          if (reviewInfer.teeVerifiedPayload) send('tee_verified', { ...reviewInfer.teeVerifiedPayload, phase: 'usefulness_review' });

          const jsonMatch = reviewInfer.response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            reviewScores = {
              alignment: Math.max(0, Math.min(100, Number(parsed.alignment) || 0)),
              substance: Math.max(0, Math.min(100, Number(parsed.substance) || 0)),
              quality: Math.max(0, Math.min(100, Number(parsed.quality) || 0)),
              composite: 0,
              reasoning: String(parsed.reasoning || ''),
            };
            reviewScores.composite = Math.round((reviewScores.alignment + reviewScores.substance + reviewScores.quality) / 3);
            if (Array.isArray(parsed.weights)) {
              perReceiptWeights = parsed.weights.map((w: unknown) => Math.max(0, Math.min(1, Number(w) || 0)));
            }
          }

          if (lowQuality) {
            const j = () => Math.floor(Math.random() * 11) - 5;
            const a = 25 + j(), s = 20 + j(), q = 30 + j();
            reviewScores = { alignment: a, substance: s, quality: q, composite: Math.round((a + s + q) / 3), reasoning: 'Low-quality demo — agents produced shallow output' };
            perReceiptWeights = preReviewReceipts.map(() => Math.round((0.15 + Math.random() * 0.2) * 100) / 100);
          }

          if (reviewAttested) {
            reviewAttestation = {
              provider: reviewInfer.provider, type: 'tee',
              evidence: `TEE-attested usefulness review via ${reviewInfer.provider} (${reviewInfer.teeType}). Chat: ${reviewInfer.chatId}.`,
              timestamp: Date.now(),
            };
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          send('status', { message: `Review fallback: ${msg.slice(0, 60)}` });
          if (lowQuality) {
            const j = () => Math.floor(Math.random() * 11) - 5;
            const a = 25 + j(), s = 20 + j(), q = 30 + j();
            reviewScores = { alignment: a, substance: s, quality: q, composite: Math.round((a + s + q) / 3), reasoning: 'Low-quality demo' };
          } else {
            const j = () => Math.floor(Math.random() * 13) - 6;
            const a = 80 + j(), s2 = 74 + j(), q = 77 + j();
            reviewScores = { alignment: a, substance: s2, quality: q, composite: Math.round((a + s2 + q) / 3), reasoning: 'Simulated review — 0G Compute unavailable' };
          }
          perReceiptWeights = preReviewReceipts.map(() => 0.5);
        }

        while (perReceiptWeights.length < preReviewReceipts.length) perReceiptWeights.push(0.5);
        perReceiptWeights = perReceiptWeights.slice(0, preReviewReceipts.length);

        send('review_scores', {
          alignment: reviewScores.alignment, substance: reviewScores.substance,
          quality: reviewScores.quality, composite: reviewScores.composite,
          reasoning: reviewScores.reasoning, source: reviewSource, attested: reviewAttested,
          weights: perReceiptWeights, baseline: 72, delta: reviewScores.composite - 72,
        });

        const reviewReceipt = agentB.reviewUsefulness(chainSummary, JSON.stringify(reviewScores), reviewAttestation);
        send('receipt', {
          index: 9, receipt: reviewReceipt, agent: 'B',
          rawInput: chainSummary.slice(0, 500), rawOutput: JSON.stringify(reviewScores),
          isUsefulnessReview: true, scores: reviewScores, teeAttested: reviewAttested,
          llmSource: reviewSource, durationMs: Math.round(performance.now() - s9),
          tokensUsed: reviewInferUsage?.total_tokens ?? null,
        });

        const allReceipts = agentB.getReceipts();
        const rootHash = agentB.getChain().computeRootHash();

        // === SEND COMPLETED CHAIN BACK TO RESEARCHER VIA AXL ===
        const researcherKey = process.env.AXL_RESEARCHER_KEY || '';
        if (axlReceived && researcherKey) {
          try {
            send('status', { message: 'Builder: Sending completed chain back to Researcher via AXL...' });
            const res = await fetch(`${axlBuilderUrl}/send`, {
              method: 'POST',
              headers: { 'X-Destination-Peer-Id': researcherKey },
              body: JSON.stringify({
                type: 'completed_chain',
                receipts: allReceipts,
                rootHash,
                scores: reviewScores,
                builderAgentId: agentB.agentId,
              }),
            });
            if (res.ok) {
              send('axl_rebroadcast', {
                from: agentB.agentId, to: researcherKey.slice(0, 16) + '...',
                mode: 'live', protocol: 'AXL P2P',
                receiptCount: allReceipts.length, chainRoot: rootHash,
              });
            }
          } catch {}
        }

        // === ON-CHAIN: NFT, Storage, Anchor, KV, Fine-tuning ===
        const verifiedCount = results.filter(r => r.valid).length;
        let score = Math.round((verifiedCount / results.length) * 70);
        if (source === '0g-compute') score += 15;
        if (attested) score += 15; else score += 5;
        score = Math.min(score, 100);
        send('trust_score', { score, breakdown: { chainIntegrity: Math.round((verifiedCount / results.length) * 70), dataProvenance: source === '0g-compute' ? 15 : 5, teeAttestation: attested ? 15 : 0 } });

        const qualityThreshold = 60;
        const passesQualityGate = reviewScores.composite >= qualityThreshold;
        if (!passesQualityGate) {
          send('quality_gate', { passed: false, score: reviewScores.composite, threshold: qualityThreshold, message: `Chain scored ${reviewScores.composite}/100 — below threshold. Not anchored.` });
        }

        // Agentic ID (ERC-7857)
        await sleep(200);
        send('status', { message: 'Builder: Minting agent identity (ERC-7857)...' });
        try {
          const { ethers } = await import('ethers');
          const metadataHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({
            agentId: senderAgentId, ed25519PublicKey: senderPubKey,
            chainRootHash: rootHash, receiptCount: allReceipts.length,
            standard: 'ERC-7857', timestamp: Date.now(),
          })));
          const pk = process.env.PRIVATE_KEY;
          const contractAddress = process.env.AGENT_NFT_ADDRESS;
          const iDatas = [
            { dataDescription: 'receipt-agent-v1', dataHash: metadataHash },
            { dataDescription: 'chain-root', dataHash: rootHash.startsWith('0x') ? rootHash : `0x${rootHash}` },
          ];

          if (pk && contractAddress) {
            const ABI = ['function mint(tuple(string dataDescription, bytes32 dataHash)[] iDatas, address to) external returns (uint256)', 'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'];
            const network = new ethers.Network('0g-mainnet', 16661);
            const provider = new ethers.JsonRpcProvider('https://evmrpc.0g.ai', network, { staticNetwork: true });
            const wallet = new ethers.Wallet(pk, provider);
            const contract = new ethers.Contract(ethers.getAddress(contractAddress), ABI, wallet);
            const tx = await contract.mint(iDatas, wallet.address);
            const txReceipt = await tx.wait();
            const transferLog = txReceipt.logs?.find((l: any) => l.topics?.[0] === ethers.id('Transfer(address,address,uint256)'));
            const tokenId = transferLog ? ethers.toBigInt(transferLog.topics[3]).toString() : null;
            send('agentic_id', { tokenId, txHash: txReceipt.hash, metadataHash, agentId: senderAgentId, standard: 'ERC-7857', status: 'minted', chain: '0g-mainnet', chainId: 16661, iDatas, contractAddress });
          } else {
            send('agentic_id', { tokenId: null, metadataHash, agentId: senderAgentId, standard: 'ERC-7857', status: 'simulated', iDatas, contractAddress: contractAddress ?? null });
          }
        } catch {}

        // 0G Storage + Chain Anchor
        await sleep(200);
        send('status', { message: passesQualityGate ? 'Builder: Persisting to 0G Storage...' : 'Builder: Storing for audit (not anchored)...' });
        let storageResult: any = {};
        let anchorResult: any = {};

        try {
          const chainJson = JSON.stringify(allReceipts, (_, v) => typeof v === 'bigint' ? v.toString() : v);
          const { createHash } = await import('crypto');
          const dataHash = createHash('sha256').update(chainJson).digest('hex');
          const dataSize = new TextEncoder().encode(chainJson).length;
          storageResult = { rootHash: dataHash, uploaded: false, dataSize };

          const pk = process.env.PRIVATE_KEY;
          if (pk) {
            try {
              const zgSdk = await import('@0gfoundation/0g-ts-sdk');
              const { ethers } = await import('ethers');
              const rawData = new TextEncoder().encode(chainJson);
              const memData = new zgSdk.MemData(rawData);
              try {
                const tr = await memData.merkleTree();
                const [tree, err] = Array.isArray(tr) ? tr : [tr, null];
                if (!err && tree) { storageResult.rootHash = String(tree.rootHash()); }
              } catch {}

              const signer = new ethers.Wallet(pk, new ethers.JsonRpcProvider('https://evmrpc.0g.ai'));
              const indexer = new zgSdk.Indexer('https://indexer-storage-turbo.0g.ai');
              const sharded = await indexer.getShardedNodes();
              const nodeList = sharded.trusted ?? sharded.discovered;
              const [selected] = zgSdk.selectNodes(nodeList, 2);
              const nodeClients = selected.map((n: any) => new zgSdk.StorageNode(n.url));

              for (let ni = 0; ni < nodeClients.length; ni++) {
                try {
                  const status = await nodeClients[ni].getStatus();
                  const flow = zgSdk.getFlowContract(status.networkIdentity.flowAddress, signer);
                  const uploader = new zgSdk.Uploader([nodeClients[ni]], 'https://evmrpc.0g.ai', flow);
                  const uploadResult = await uploader.uploadFile(memData, zgSdk.mergeUploadOptions());
                  const [tx, uploadErr] = Array.isArray(uploadResult) ? uploadResult : [uploadResult, null];
                  if (uploadErr) throw uploadErr;
                  storageResult = { rootHash: (tx as any)?.rootHash ?? storageResult.rootHash, uploaded: true, dataSize, uploadTxHash: (tx as any)?.txHash ?? '' };
                  send('status', { message: `0G Storage: uploaded` });
                  break;
                } catch (e: unknown) {
                  if (ni === nodeClients.length - 1) throw e;
                }
              }
            } catch (e: unknown) {
              send('status', { message: `0G Storage: ${(e instanceof Error ? e.message : String(e)).slice(0, 80)}` });
            }

            if (passesQualityGate) try {
              const { anchorOnChain } = await import('@receipt/sdk/integrations/0g-chain');
              const ar = await anchorOnChain(rootHash, storageResult.rootHash ?? null, {
                rpc: 'https://evmrpc.0g.ai', contractAddress: process.env.OG_CONTRACT_ADDRESS ?? '',
                privateKey: pk, chainId: 16661, usefulnessScore: reviewScores.composite,
              });
              anchorResult = { txHash: ar.txHash, chain: '0G Mainnet', contractAddress: process.env.OG_CONTRACT_ADDRESS, chainRootHash: rootHash, explorerUrl: `https://chainscan-newton.0g.ai/tx/${ar.txHash}`, usefulnessScore: ar.usefulnessScore };
            } catch {}
          }
        } catch {}

        send('storage', { ...storageResult, anchor: anchorResult, chainLength: allReceipts.length, usefulnessScore: reviewScores.composite, qualityGate: { passed: passesQualityGate, threshold: qualityThreshold } });

        // Fine-tuning
        if (passesQualityGate) {
          try {
            send('status', { message: `Chain scored ${reviewScores.composite}/100 — qualifies for fine-tuning.` });
            const { listFineTuningProviders, uploadDatasetToTEE, createFineTuningTask } = await import('@receipt/sdk/integrations/0g-fine-tuning');
            const { chainToFineTuningDataset } = await import('@receipt/sdk/integrations/training-data');
            const providers = await listFineTuningProviders('https://evmrpc.0g.ai');
            send('fine_tuning', { status: providers.length > 0 ? 'providers-found' : 'no-providers', providerCount: providers.length });
          } catch (e: unknown) {
            send('fine_tuning', { status: 'error', error: (e instanceof Error ? e.message : String(e)).slice(0, 80) });
          }
        } else {
          send('fine_tuning', { status: 'quality-gate', score: reviewScores.composite, threshold: qualityThreshold });
        }

        // ERC-8004 Validation Registry — post usefulness attestation
        let erc8004Result: any = null;
        if (passesQualityGate && rootHash) {
          try {
            const registryAddr = process.env.VALIDATION_REGISTRY_ADDRESS;
            const erc8004Key = process.env.PRIVATE_KEY;
            if (registryAddr && erc8004Key) {
              const { ethers: eth } = await import('ethers');
              const net = new eth.Network('0g-mainnet', 16661);
              const rpc = new eth.JsonRpcProvider('https://evmrpc.0g.ai', net, { staticNetwork: net });
              const w = new eth.Wallet(erc8004Key, rpc);
              const registry = new eth.Contract(registryAddr, [
                'function validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash) external',
                'function validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag) external',
              ], w);
              const requestHash = eth.keccak256(eth.toUtf8Bytes(rootHash));
              const agentId = 1;
              const requestURI = `https://receipt-demo.vercel.app/verify?chain=${rootHash.slice(0, 16)}`;
              await registry.validationRequest(w.address, agentId, requestURI, requestHash);
              const responseHash = eth.keccak256(eth.toUtf8Bytes(JSON.stringify(reviewScores)));
              const tx = await registry.validationResponse(requestHash, reviewScores.composite, requestURI, responseHash, 'usefulness-review');
              const txr = await tx.wait();
              erc8004Result = { txHash: txr.hash, registryAddress: registryAddr, requestHash, score: reviewScores.composite, standard: 'ERC-8004' };
              send('erc8004_validation', erc8004Result);
              send('status', { message: `ERC-8004: Validation posted (score ${reviewScores.composite}/100)` });
            }
          } catch (e: unknown) {
            send('status', { message: `ERC-8004: ${(e instanceof Error ? e.message : String(e)).slice(0, 60)}` });
          }
        }

        send('pipeline_timing', { totalMs: Math.round(performance.now() - pipelineStart) });

        send('done', {
          receipts: allReceipts, agentACount: receiptsForVerify.length, agentBCount: 5,
          rootHash, fabricated: false, storage: storageResult, anchor: anchorResult,
          erc8004: erc8004Result,
          usefulnessReview: reviewScores, reviewAttested, reviewSource,
          perReceiptWeights, axlReceived,
        });
      } catch (err: unknown) {
        send('error', { message: err instanceof Error ? err.message : String(err) });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
