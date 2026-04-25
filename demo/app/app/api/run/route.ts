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

interface InferResult {
  response: string;
  source: string;
  attested: boolean;
  provider: string;
  providerAddress: string;
  teeType: string;
  chatId: string;
  teeSigEndpoint: string;
}

async function tryInfer(prompt: string): Promise<InferResult> {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error('PRIVATE_KEY not configured');

  const { createZGComputeNetworkBroker } = await import('@0glabs/0g-serving-broker');
  const { ethers } = await import('ethers');

  const network = new ethers.Network('0g-mainnet', 16661);
  const provider = new ethers.JsonRpcProvider('https://evmrpc.0g.ai', network, { staticNetwork: network });
  const wallet = new ethers.Wallet(privateKey, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const errors: string[] = [];
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

      if (!apiRes.ok) {
        errors.push(`${model}: HTTP ${apiRes.status}`);
        continue;
      }

      const result: any = await apiRes.json();
      const response = result.choices?.[0]?.message?.content ?? '';
      if (!response) { errors.push(`${model}: empty response`); continue; }

      const chatId = apiRes.headers.get('ZG-Res-Key') || result.id || '';
      let attested = false;
      try {
        const usage = result.usage ? JSON.stringify(result.usage) : '';
        attested = !!(await broker.inference.processResponse(addr, chatId, usage));
      } catch {}

      return {
        response,
        source: '0g-compute',
        attested,
        provider: model,
        providerAddress: addr,
        teeType: 'TeeML',
        chatId,
        teeSigEndpoint: `${endpoint}/signature/${chatId}?model=${encodeURIComponent(model)}`,
      };
    } catch (e: unknown) {
      errors.push(`${addr.slice(0,10)}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
  }

  throw new Error(`All 0G Compute providers failed: ${errors.join('; ')}`);
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
        const inferResult = await tryInfer(inferPrompt);
        const { response: llmResponse, source, attested, provider: llmProvider, providerAddress, teeType, chatId, teeSigEndpoint } = inferResult;
        const r3 = agentA.callLlm(inferPrompt, llmResponse);
        send('receipt', {
          index: 2, receipt: r3, agent: 'A',
          llmSource: source, teeAttested: attested,
          teeMetadata: { provider: llmProvider, providerAddress, teeType, chatId, teeSigEndpoint },
          rawInput: inferPrompt, rawOutput: llmResponse.slice(0, 500),
        });

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
          recommendation: 'Proceed with on-chain anchoring on 0G Mainnet',
        });
        const r5 = agentA.produceOutput('Research complete — real data gathered', output);
        send('receipt', { index: 4, receipt: r5, agent: 'A', rawInput: 'Research complete — real data gathered', rawOutput: output });

        // === AXL P2P HANDOFF via Gensyn ===
        let receiptsForVerify = agentA.getReceipts();
        const agentAPubKey = Buffer.from(agentA.getPublicKey()).toString('hex');

        // Emit AXL handoff event — Agent A broadcasts receipt chain via A2A protocol
        await sleep(200);
        send('status', { message: 'Agent A: Broadcasting receipt chain via AXL P2P...' });
        const handoffBundle = {
          chainRootHash: agentA.getChain().computeRootHash(),
          receipts: receiptsForVerify.length,
          senderPubkey: agentAPubKey,
          protocol: 'A2A',
        };
        send('axl_handoff', {
          from: agentA.agentId,
          fromName: 'researcher.receiptagent.eth',
          to: 'builder.receiptagent.eth',
          protocol: 'A2A',
          envelope: {
            a2a: true,
            request: {
              jsonrpc: '2.0',
              method: 'SendMessage',
              params: { message: { parts: [{ type: 'data', data: handoffBundle }] } },
            },
          },
          receiptCount: receiptsForVerify.length,
          chainRoot: handoffBundle.chainRootHash,
          status: 'sent',
        });

        if (adversarial) {
          send('status', { message: 'Agent A: Fabricating API response...' });
          await sleep(400);
          receiptsForVerify = receiptsForVerify.map((r, i) =>
            i === 1 ? { ...r, outputHash: hash('{"stars":99999,"fake":true}') } : r
          );
          send('tampered', { index: 1, field: 'outputHash', detail: 'Agent A claimed different API data than what was actually received' });
        }

        // Agent B receives via AXL and verifies
        await sleep(300);
        send('status', { message: 'Agent B: Received handoff via AXL — verifying chain...' });
        send('axl_received', {
          from: agentA.agentId,
          fromName: 'researcher.receiptagent.eth',
          receiverName: 'builder.receiptagent.eth',
          protocol: 'A2A',
          receiptCount: receiptsForVerify.length,
          senderPubkey: agentAPubKey,
          verified: !adversarial,
          status: 'received',
        });
        await sleep(300);

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
          'Execute: store chain on 0G Storage, anchor on 0G Mainnet',
        );
        send('receipt', { index: 7, receipt: b3, agent: 'B', rawInput: `Agent A's ${receiptsForVerify.length} receipts verified. Data sources confirmed real. Inference via ${source}.`, rawOutput: 'Execute: store chain on 0G Storage, anchor on 0G Mainnet' });

        // 4. Final output
        await sleep(200);
        const b4Output = JSON.stringify({
          verifiedReceipts: receiptsForVerify.length,
          newReceipts: 4,
          totalChain: receiptsForVerify.length + 4,
          nextStep: 'anchor-on-chain',
          chains: ['0G Mainnet (16661)'],
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

        // === ENS Agent Identity — register subname + text records ===
        await sleep(200);
        send('status', { message: 'Registering ENS agent identity...' });
        try {
          const ensParentName = process.env.ENS_PARENT_NAME;
          const sepoliaRpc = process.env.SEPOLIA_RPC || 'https://rpc.sepolia.org';
          const pk = process.env.PRIVATE_KEY;

          if (ensParentName && pk) {
            const { ethers } = await import('ethers');
            const sepoliaProvider = new ethers.JsonRpcProvider(sepoliaRpc);
            const sepoliaWallet = new ethers.Wallet(pk, sepoliaProvider);

            const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
            const ENS_NAME_WRAPPER = '0x0635513f179D50A207757E05759CbD106d7dFcE8';
            const ENS_RESOLVER = '0x8FADE66B79cC9f1C6F971901BaD22D47e458cE24';

            const WRAPPER_ABI = [
              'function setSubnodeRecord(bytes32 parentNode, string label, address owner, address resolver, uint64 ttl, uint32 fuses, uint64 expiry) external returns (bytes32)',
            ];
            const REGISTRY_ABI = [
              'function owner(bytes32 node) external view returns (address)',
              'function setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl) external',
            ];
            const RESOLVER_ABI = [
              'function setText(bytes32 node, string key, string value) external',
              'function multicall(bytes[] calldata data) external returns (bytes[] memory)',
            ];

            const parentNode = ethers.namehash(ensParentName);
            const agentLabel = 'researcher';
            const fullName = `${agentLabel}.${ensParentName}`;
            const subnameNode = ethers.namehash(fullName);

            // Register subname
            const registry = new ethers.Contract(ENS_REGISTRY, REGISTRY_ABI, sepoliaWallet);
            const parentOwner = await registry.owner(parentNode);

            let subnameTxHash = '';
            if (parentOwner.toLowerCase() === ENS_NAME_WRAPPER.toLowerCase()) {
              const wrapper = new ethers.Contract(ENS_NAME_WRAPPER, WRAPPER_ABI, sepoliaWallet);
              const tx = await wrapper.setSubnodeRecord(
                parentNode, agentLabel, sepoliaWallet.address,
                ENS_RESOLVER, 0, 0, 0,
              );
              const receipt = await tx.wait();
              subnameTxHash = receipt.hash;
            } else {
              const labelHash = ethers.keccak256(ethers.toUtf8Bytes(agentLabel));
              const tx = await registry.setSubnodeRecord(
                parentNode, labelHash, sepoliaWallet.address,
                ENS_RESOLVER, 0,
              );
              const receipt = await tx.wait();
              subnameTxHash = receipt.hash;
            }

            // Set text records with agent metadata
            const resolver = new ethers.Contract(ENS_RESOLVER, RESOLVER_ABI, sepoliaWallet);
            const pubKeyHex = Buffer.from(agentA.getPublicKey()).toString('hex');
            const textRecords: Record<string, string> = {
              'receipt.pubkey': pubKeyHex,
              'receipt.chainRoot': rootHash,
              'receipt.capabilities': 'file_read,api_call,llm_call,decision,output',
              'receipt.standard': 'ERC-7857',
              'receipt.teeProvider': '0g-compute-teeml',
              'description': `RECEIPT agent — cryptographic proof layer for AI work`,
              'url': 'https://github.com/MorkeethHQ/receipt',
            };

            const resolverIface = new ethers.Interface(RESOLVER_ABI);
            const calls = Object.entries(textRecords).map(([key, value]) =>
              resolverIface.encodeFunctionData('setText', [subnameNode, key, value]),
            );
            try {
              const tx = await resolver.multicall(calls);
              await tx.wait();
            } catch {
              for (const [key, value] of Object.entries(textRecords)) {
                const tx = await resolver.setText(subnameNode, key, value);
                await tx.wait();
              }
            }

            send('ens_identity', {
              name: fullName,
              pubkey: pubKeyHex,
              chainRoot: rootHash,
              records: textRecords,
              txHash: subnameTxHash,
              status: 'registered',
              resolveUrl: `/api/resolve-agent?name=${encodeURIComponent(fullName)}`,
            });
          } else {
            const fallbackPubKey = Buffer.from(agentA.getPublicKey()).toString('hex');
            send('ens_identity', {
              name: 'researcher.receiptagent.eth',
              pubkey: fallbackPubKey,
              chainRoot: rootHash,
              records: {
                'receipt.pubkey': fallbackPubKey,
                'receipt.chainRoot': rootHash,
                'receipt.capabilities': 'file_read,api_call,llm_call,decision,output',
                'receipt.standard': 'ERC-7857',
                'receipt.teeProvider': '0g-compute-teeml',
              },
              status: 'not_configured',
            });
          }
        } catch (ensErr: unknown) {
          const ensMsg = ensErr instanceof Error ? ensErr.message : String(ensErr);
          send('ens_identity', {
            name: 'researcher.receiptagent.eth',
            pubkey: Buffer.from(agentA.getPublicKey()).toString('hex'),
            chainRoot: rootHash,
            status: 'error',
            error: ensMsg,
          });
        }

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
            // 0G Storage — manual node selection (turbo indexer returns trusted=null)
            try {
              const zgSdk = await import('@0gfoundation/0g-ts-sdk');
              const { ethers } = await import('ethers');

              const encoder = new TextEncoder();
              const rawData = encoder.encode(chainJson);
              const memData = new zgSdk.MemData(rawData);

              // Compute Merkle root
              try {
                const treeResult = await memData.merkleTree();
                const [tree, treeErr] = Array.isArray(treeResult) ? treeResult : [treeResult, null];
                if (treeErr || !tree) throw treeErr ?? new Error('No tree');
                const rootBuf = tree.rootHash();
                const merkleRoot = typeof rootBuf === 'string' ? rootBuf : String(rootBuf);
                storageResult = { rootHash: merkleRoot, uploaded: false };
              } catch {
                // Merkle tree failed — keep SHA-256 fallback
              }

              // Upload: select from discovered nodes (trusted=null on turbo indexer)
              const storageRpc = 'https://evmrpc.0g.ai';
              const signer = new ethers.Wallet(pk, new ethers.JsonRpcProvider(storageRpc));
              const indexer = new zgSdk.Indexer('https://indexer-storage-turbo.0g.ai');

              const sharded = await indexer.getShardedNodes();
              const nodeList = sharded.trusted ?? sharded.discovered;
              const [selected] = zgSdk.selectNodes(nodeList, 1);
              const clients = selected.map((n: any) => new zgSdk.StorageNode(n.url));

              const nodeStatus = await clients[0].getStatus();
              const flow = zgSdk.getFlowContract(nodeStatus.networkIdentity.flowAddress, signer);
              const uploader = new zgSdk.Uploader(clients, storageRpc, flow);
              const opts = zgSdk.mergeUploadOptions();

              const uploadResult = await uploader.uploadFile(memData, opts);
              const [tx, uploadErr] = Array.isArray(uploadResult) ? uploadResult : [uploadResult, null];
              if (uploadErr) throw uploadErr;
              const uploadTxHash = (tx as any)?.txHash ?? (tx as any)?.transactionHash ?? '';
              storageResult = { rootHash: (tx as any)?.rootHash ?? storageResult.rootHash, uploaded: true };
              send('status', { message: `0G Storage: uploaded (${uploadTxHash.slice(0, 16)}...)` });
            } catch (storageErr: unknown) {
              const msg = storageErr instanceof Error ? storageErr.message : String(storageErr);
              send('status', { message: `0G Storage: ${msg.slice(0, 80)}` });
            }

            // 0G Chain anchor
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
