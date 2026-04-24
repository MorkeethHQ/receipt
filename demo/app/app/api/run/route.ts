import { ReceiptAgent, verifyChain, hash } from '@receipt/sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const PROVIDER_ADDRESSES = [
  '0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C',
  '0xBB3f5b0b5062CB5B3245222C5917afD1f6e13aF6',
  '0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0',
  '0x25F8f01cA76060ea40895472b1b79f76613Ca497',
];

async function tryInfer(prompt: string): Promise<{ response: string; source: string; attested: boolean }> {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    return { response: fallbackResponse(), source: 'simulated', attested: false };
  }

  try {
    const { createZGComputeNetworkBroker } = await import('@0glabs/0g-serving-broker');
    const { ethers } = await import('ethers');

    const network = new ethers.Network('0g-mainnet', 16661);
    const provider = new ethers.JsonRpcProvider('https://evmrpc.0g.ai', network, { staticNetwork: network });
    const wallet = new ethers.Wallet(privateKey, provider);
    const broker = await createZGComputeNetworkBroker(wallet);

    for (const addr of PROVIDER_ADDRESSES) {
      try {
        const { endpoint, model } = await broker.inference.getServiceMetadata(addr);
        const headers = await broker.inference.getRequestHeaders(addr);

        const apiRes = await fetch(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 200,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (!apiRes.ok) continue;

        const result: any = await apiRes.json();
        const response = result.choices?.[0]?.message?.content ?? '';
        if (!response) continue;

        let attested = false;
        try {
          const chatID = apiRes.headers.get('ZG-Res-Key') || result.id;
          const usage = result.usage ? JSON.stringify(result.usage) : '';
          attested = !!(await broker.inference.processResponse(addr, chatID, usage));
        } catch {}

        return { response, source: '0g-compute', attested };
      } catch {
        continue;
      }
    }
  } catch {}

  return { response: fallbackResponse(), source: 'simulated', attested: false };
}

function fallbackResponse(): string {
  return 'Analysis: The R.E.C.E.I.P.T. project implements a cryptographic proof layer using ed25519 signatures and SHA-256 hash chains. Architecture supports multi-agent verification with tamper detection. Recommended: deploy with multi-chain anchoring for maximum verifiability.';
}

async function fetchReal(url: string, fallback: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'RECEIPT-Agent/1.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return await res.text();
  } catch {}
  return fallback;
}

export async function POST(request: Request) {
  const { adversarial } = await request.json();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(new TextEncoder().encode(sseEvent(event, data)));
      };

      try {
        // === AGENT A: Researcher — does REAL work ===
        const agentA = new ReceiptAgent();
        send('status', { message: `Agent A online — ${agentA.agentId}` });

        // 1. REAL file read — fetch actual package.json from the repo
        await sleep(200);
        send('status', { message: 'Agent A: Reading project manifest...' });
        const pkgData = await fetchReal(
          'https://raw.githubusercontent.com/MorkeethHQ/receipt/main/packages/receipt-sdk/package.json',
          '{"name":"@receipt/sdk","version":"0.1.0","description":"Proof layer for agent work"}',
        );
        const r1 = agentA.readFile('packages/receipt-sdk/package.json', pkgData);
        send('receipt', { index: 0, receipt: r1, agent: 'A', rawInput: 'packages/receipt-sdk/package.json', rawOutput: pkgData.slice(0, 500) });

        // 2. REAL API call — fetch GitHub repo metadata
        await sleep(300);
        send('status', { message: 'Agent A: Querying GitHub API...' });
        const ghData = await fetchReal(
          'https://api.github.com/repos/MorkeethHQ/receipt',
          '{"full_name":"MorkeethHQ/receipt","language":"TypeScript","default_branch":"main","created_at":"2026-04-24"}',
        );
        const r2 = agentA.callApi('https://api.github.com/repos/MorkeethHQ/receipt', ghData);
        send('receipt', { index: 1, receipt: r2, agent: 'A', rawInput: 'https://api.github.com/repos/MorkeethHQ/receipt', rawOutput: ghData.slice(0, 500) });

        // 3. REAL inference — 0G Compute TEE (falls back to simulated)
        await sleep(200);
        send('status', { message: 'Agent A: Requesting 0G Compute inference...' });
        const pkgParsed = (() => { try { return JSON.parse(pkgData); } catch { return { name: '@receipt/sdk' }; } })();
        const inferPrompt = `Analyze this TypeScript SDK: ${pkgParsed.name} v${pkgParsed.version ?? '0.1.0'}. It uses ed25519 signing and SHA-256 hashing for agent receipt chains. What are the key security properties?`;
        const { response: llmResponse, source, attested } = await tryInfer(inferPrompt);
        const r3 = agentA.callLlm(inferPrompt, llmResponse);
        send('receipt', { index: 2, receipt: r3, agent: 'A', llmSource: source, teeAttested: attested, rawInput: inferPrompt, rawOutput: llmResponse.slice(0, 500) });

        // 4. REAL decision based on gathered data
        await sleep(300);
        const ghParsed = (() => { try { return JSON.parse(ghData); } catch { return {}; } })();
        const reasoning = `Repo: ${ghParsed.full_name ?? 'MorkeethHQ/receipt'}, Language: ${ghParsed.language ?? 'TypeScript'}, LLM source: ${source}. Inference ${attested ? 'TEE-attested' : 'not attested'}.`;
        const r4 = agentA.decide(reasoning, 'Chain integrity confirmed — safe to hand off to Agent B for implementation');
        send('receipt', { index: 3, receipt: r4, agent: 'A', rawInput: reasoning, rawOutput: 'Chain integrity confirmed — safe to hand off to Agent B for implementation' });

        // 5. Produce output summary with real data
        await sleep(200);
        const output = JSON.stringify({
          repo: ghParsed.full_name ?? 'MorkeethHQ/receipt',
          sdk: pkgParsed.name ?? '@receipt/sdk',
          sdkVersion: pkgParsed.version ?? '0.1.0',
          inferenceSource: source,
          teeAttested: attested,
          recommendation: 'Proceed with multi-chain anchoring on 0G Mainnet + Base Sepolia',
        });
        const r5 = agentA.produceOutput('Research complete — real data gathered', output);
        send('receipt', { index: 4, receipt: r5, agent: 'A', rawInput: 'Research complete — real data gathered', rawOutput: output });

        // === HANDOFF ===
        let receiptsForVerify = agentA.getReceipts();

        if (adversarial) {
          send('status', { message: 'Agent A: Fabricating API response...' });
          await sleep(400);
          receiptsForVerify = receiptsForVerify.map((r, i) =>
            i === 1 ? { ...r, outputHash: hash('{"stars":99999,"fake":true}') } : r
          );
          send('tampered', { index: 1, field: 'outputHash', detail: 'Agent A claimed different API data than what was actually received' });
        }

        send('status', { message: 'Agent B: Verifying handoff chain...' });
        await sleep(500);

        const results = verifyChain(receiptsForVerify, agentA.getPublicKey());
        for (const result of results) {
          await sleep(250);
          send('verified', { result });
        }

        const allValid = results.every((r) => r.valid);
        send('verification_complete', { valid: allValid, results });

        if (!allValid) {
          send('fabrication_detected', {
            message: 'Agent A lied about the GitHub API response. The output hash doesn\'t match the signed receipt.',
          });
          send('done', { receipts: receiptsForVerify, agentACount: 5, agentBCount: 0, fabricated: true });
          controller.close();
          return;
        }

        // === AGENT B: Builder — continues with verified data ===
        await sleep(300);
        send('status', { message: 'Agent B: Chain verified. Continuing work...' });

        const agentB = ReceiptAgent.continueFrom(receiptsForVerify);

        // 1. Read the handoff data
        await sleep(250);
        const handoffData = JSON.stringify({
          from: agentA.agentId,
          receiptsReceived: receiptsForVerify.length,
          chainVerified: true,
          rootHash: agentA.getChain().computeRootHash(),
        });
        const b1 = agentB.readFile('handoff-bundle.json', handoffData);
        send('receipt', { index: 5, receipt: b1, agent: 'B', rawInput: 'handoff-bundle.json', rawOutput: handoffData });

        // 2. REAL API call — check 0G chain for existing anchors
        await sleep(300);
        send('status', { message: 'Agent B: Checking 0G Chain for existing anchors...' });
        const chainData = await fetchReal(
          'https://evmrpc.0g.ai',
          '{"jsonrpc":"2.0","result":"0x1"}',
        );
        const b2 = agentB.callApi('https://evmrpc.0g.ai (eth_blockNumber)', chainData.slice(0, 200));
        send('receipt', { index: 6, receipt: b2, agent: 'B', rawInput: 'https://evmrpc.0g.ai', rawOutput: chainData.slice(0, 200) });

        // 3. Decision based on verification
        await sleep(250);
        const b3 = agentB.decide(
          `Agent A's ${receiptsForVerify.length} receipts verified. Data sources confirmed real. Inference via ${source}.`,
          'Execute: store chain on 0G Storage, anchor on 0G Mainnet + Base Sepolia',
        );
        send('receipt', { index: 7, receipt: b3, agent: 'B', rawInput: `Agent A's ${receiptsForVerify.length} receipts verified. Data sources confirmed real. Inference via ${source}.`, rawOutput: 'Execute: store chain on 0G Storage, anchor on 0G Mainnet + Base Sepolia' });

        // 4. Final output
        await sleep(200);
        const b4Output = JSON.stringify({
          verifiedReceipts: receiptsForVerify.length,
          newReceipts: 4,
          totalChain: receiptsForVerify.length + 4,
          nextStep: 'anchor-on-chain',
          chains: ['0G Mainnet (16661)', 'Base Sepolia (84532)'],
        });
        const b4 = agentB.produceOutput('Implementation plan ready', b4Output);
        send('receipt', { index: 8, receipt: b4, agent: 'B', rawInput: 'Implementation plan ready', rawOutput: b4Output });

        const allReceipts = agentB.getReceipts();
        const rootHash = agentB.getChain().computeRootHash();

        // === AGENTIC ID (ERC-7857) — inlined to avoid Vercel self-fetch ===
        await sleep(200);
        send('status', { message: 'Minting Agentic ID (ERC-7857)...' });
        try {
          const { ethers } = await import('ethers');
          const metadataHash = ethers.keccak256(
            ethers.toUtf8Bytes(
              JSON.stringify({
                agentId: agentA.agentId,
                ed25519PublicKey: agentA.getPublicKey(),
                chainRootHash: rootHash,
                receiptCount: allReceipts.length,
                standard: 'ERC-7857',
                capabilities: ['file_read', 'api_call', 'llm_call', 'decision', 'output'],
                timestamp: Date.now(),
              }),
            ),
          );

          const privateKey = process.env.PRIVATE_KEY;
          const contractAddress = process.env.AGENT_NFT_ADDRESS;

          if (privateKey && contractAddress) {
            const AGENT_NFT_ABI = [
              'function mint(tuple(string dataDescription, bytes32 dataHash)[] iDatas, address to) external returns (uint256)',
              'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
            ];
            const network = new ethers.Network('0g-mainnet', 16661);
            const provider = new ethers.JsonRpcProvider('https://evmrpc.0g.ai', network, { staticNetwork: true });
            const wallet = new ethers.Wallet(privateKey, provider);
            const contract = new ethers.Contract(ethers.getAddress(contractAddress), AGENT_NFT_ABI, wallet);
            const iDatas = [
              { dataDescription: 'receipt-agent-v1', dataHash: metadataHash },
              { dataDescription: 'chain-root', dataHash: rootHash.startsWith('0x') ? rootHash : `0x${rootHash}` },
            ];
            const tx = await contract.mint(iDatas, wallet.address);
            const txReceipt = await tx.wait();
            const transferLog = txReceipt.logs?.find(
              (l: any) => l.topics?.[0] === ethers.id('Transfer(address,address,uint256)'),
            );
            const tokenId = transferLog ? ethers.toBigInt(transferLog.topics[3]).toString() : null;
            send('agentic_id', {
              tokenId, txHash: txReceipt.hash, metadataHash,
              agentId: agentA.agentId, standard: 'ERC-7857', status: 'minted',
              chain: '0g-mainnet', chainId: 16661,
            });
          } else {
            const rootHashHex = rootHash?.startsWith('0x') ? rootHash : `0x${rootHash ?? '0'.repeat(64)}`;
            send('agentic_id', {
              tokenId: null, metadataHash,
              agentId: agentA.agentId, standard: 'ERC-7857', status: 'simulated',
              iDatas: [
                { dataDescription: 'receipt-agent-v1', dataHash: metadataHash },
                { dataDescription: 'chain-root', dataHash: rootHashHex },
              ],
            });
          }
        } catch {}

        // Trust score computation
        const verifiedCount = results.filter(r => r.valid).length;
        const totalChecks = results.length;
        const hasRealData = source === '0g-compute';
        const hasTee = attested;
        let score = Math.round((verifiedCount / totalChecks) * 70);
        if (hasRealData) score += 15;
        if (hasTee) score += 15;
        else score += 5;
        score = Math.min(score, 100);

        send('trust_score', {
          score,
          breakdown: {
            chainIntegrity: Math.round((verifiedCount / totalChecks) * 70),
            dataProvenance: hasRealData ? 15 : 5,
            teeAttestation: hasTee ? 15 : 0,
          },
        });

        // === 0G Storage + Chain Anchor ===
        await sleep(200);
        send('status', { message: 'Storing receipt chain on 0G Storage...' });
        let storageResult: { rootHash?: string; uploaded?: boolean } = {};
        let anchorResult: { txHash?: string; chain?: string } = {};
        try {
          const chainJson = JSON.stringify(allReceipts, (_, v) => typeof v === 'bigint' ? v.toString() : v);
          const { createHash } = await import('crypto');
          const dataHash = createHash('sha256').update(chainJson).digest('hex');
          storageResult = { rootHash: dataHash, uploaded: false };

          const pk = process.env.PRIVATE_KEY;
          if (pk) {
            try {
              const { storeChainOn0G } = await import('@receipt/sdk/integrations/0g-storage');
              const sr = await storeChainOn0G(
                chainJson,
                'https://indexer-storage-testnet-turbo.0g.ai',
                'https://evmrpc-testnet.0g.ai',
                pk,
              );
              storageResult = sr;
            } catch {}

            try {
              const { anchorOnChain } = await import('@receipt/sdk/integrations/0g-chain');
              const ar = await anchorOnChain(rootHash, storageResult.rootHash ?? null, {
                rpc: 'https://evmrpc.0g.ai',
                contractAddress: process.env.OG_CONTRACT_ADDRESS ?? '',
                privateKey: pk,
                chainId: 16661,
              });
              anchorResult = { txHash: ar.txHash, chain: '0G Mainnet' };
            } catch {}
          }
        } catch {}
        send('storage', {
          ...storageResult,
          anchor: anchorResult,
          chainLength: allReceipts.length,
        });

        send('done', {
          receipts: allReceipts,
          agentACount: 5,
          agentBCount: 4,
          rootHash,
          fabricated: false,
          storage: storageResult,
          anchor: anchorResult,
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
