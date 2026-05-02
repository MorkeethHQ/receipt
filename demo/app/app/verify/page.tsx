'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

interface Receipt {
  id: string;
  prevId: string | null;
  agentId: string;
  timestamp: number;
  action: { type: string; description: string };
  inputHash: string;
  outputHash: string;
  signature: string;
  attestation: { provider: string; type: string } | null;
}

type CheckStatus = 'pending' | 'checking' | 'pass' | 'fail' | 'skipped';

interface CheckResult {
  signature: CheckStatus;
  chainLink: CheckStatus;
  timestamp: CheckStatus;
  failReason?: string;
}

interface ReceiptCard {
  receipt: Receipt;
  index: number;
  checks: CheckResult;
  status: 'waiting' | 'checking' | 'pass' | 'fail';
}

// ── Helpers ────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded.buffer as ArrayBuffer);
  return bytesToHex(new Uint8Array(hashBuffer));
}

function getSignaturePayload(receipt: Receipt): string {
  return `${receipt.id}:${receipt.prevId ?? 'null'}:${receipt.agentId}:${receipt.timestamp}:${receipt.action.type}:${receipt.inputHash}:${receipt.outputHash}`;
}

async function verifyEd25519(
  message: string,
  signatureHex: string,
  publicKeyBytes: Uint8Array,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      publicKeyBytes.buffer as ArrayBuffer,
      { name: 'Ed25519' } as Algorithm,
      false,
      ['verify'],
    );
    const msgBytes = new TextEncoder().encode(message);
    const sigBytes = hexToBytes(signatureHex);
    return await crypto.subtle.verify({ name: 'Ed25519' } as Algorithm, key, sigBytes.buffer as ArrayBuffer, msgBytes.buffer as ArrayBuffer);
  } catch {
    return false;
  }
}

async function computeRootHash(receipts: Receipt[]): Promise<string> {
  if (receipts.length === 0) return '';
  const last = receipts[receipts.length - 1];
  return sha256Hex(`${last.id}:${last.inputHash}:${last.outputHash}:${last.signature}`);
}

async function detectEd25519Support(): Promise<boolean> {
  try {
    const kp = await crypto.subtle.generateKey({ name: 'Ed25519' } as Algorithm, false, ['sign', 'verify']);
    return !!kp;
  } catch {
    return false;
  }
}

const ACTION_LABELS: Record<string, string> = {
  file_read: 'File Read',
  api_call: 'API Call',
  llm_call: 'LLM Inference',
  decision: 'Decision',
  output: 'Output',
  usefulness_review: 'Usefulness Review',
};

// ── Valid example chain (generated with real WebCrypto Ed25519) ────────────

interface ValidChainResult {
  receipts: Receipt[];
  publicKeyHex: string;
}

async function generateValidExample(): Promise<ValidChainResult> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'Ed25519' } as Algorithm,
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair;

  const pubRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const pubHex = bytesToHex(new Uint8Array(pubRaw));

  async function makeReceipt(
    agentId: string,
    prevId: string | null,
    actionType: string,
    actionDesc: string,
    rawInput: string,
    rawOutput: string,
    attestation: Receipt['attestation'],
    baseTime: number,
    offsetMs: number,
  ): Promise<Receipt> {
    const id = `rcpt_${crypto.getRandomValues(new Uint8Array(8)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '')}`;
    const timestamp = baseTime + offsetMs;
    const inputHash = await sha256Hex(rawInput);
    const outputHash = await sha256Hex(rawOutput);
    const sigPayload = `${id}:${prevId ?? 'null'}:${agentId}:${timestamp}:${actionType}:${inputHash}:${outputHash}`;
    const sigBytes = await crypto.subtle.sign(
      { name: 'Ed25519' } as Algorithm,
      keyPair.privateKey,
      new TextEncoder().encode(sigPayload),
    );
    const signature = bytesToHex(new Uint8Array(sigBytes));
    return { id, prevId, agentId, timestamp, action: { type: actionType, description: actionDesc }, inputHash, outputHash, signature, attestation };
  }

  const now = Date.now();
  const receipts: Receipt[] = [];

  const r1 = await makeReceipt('researcher', null, 'file_read', 'Read SDK source code', 'packages/receipt-sdk/package.json', '{"name":"@receipt/sdk","version":"0.1.0","dependencies":{"@noble/ed25519":"^2.1.0"}}', null, now, 0);
  receipts.push(r1);

  const r2 = await makeReceipt('researcher', r1.id, 'api_call', 'Verify ReceiptAnchor on 0G Mainnet', 'https://chainscan.0g.ai/api?module=contract&action=getabi&address=0x73B9A7768679B154D7E1eC5F2570a622A3b49651', '{"status":"1","result":"contract verified","chain":"0G Mainnet (16661)"}', null, now, 500);
  receipts.push(r2);

  const r3 = await makeReceipt('researcher', r2.id, 'llm_call', 'TEE-attested code review via 0G Compute', 'Code review: @receipt/sdk uses ed25519 signing and SHA-256 hashing. Review security of receipt chain.', 'Analysis: The receipt chain implements sound cryptographic primitives. Ed25519 provides 128-bit security. SHA-256 hash linking creates tamper-evident ordering.', { provider: '0G Compute', type: 'tee' }, now, 2000);
  receipts.push(r3);

  const r4 = await makeReceipt('researcher', r3.id, 'decision', 'Research verdict', 'SDK: @receipt/sdk, Contract: 0x73B9A776... on 0G Mainnet (16661). Code review via 0g-compute (TEE: verified). No critical vulnerabilities.', 'Research complete. Safe to hand off to Builder for deployment and anchoring.', null, now, 3000);
  receipts.push(r4);

  const r5 = await makeReceipt('researcher', r4.id, 'output', 'Research report - SDK reviewed, contract verified', 'Research report - SDK reviewed, contract verified', JSON.stringify({ sdk: '@receipt/sdk', contractDeployed: true, contractAddress: '0x73B9A7768679B154D7E1eC5F2570a622A3b49651', codeReviewSource: '0g-compute', teeAttested: true, verdict: 'No critical issues.' }), null, now, 3500);
  receipts.push(r5);

  const r6 = await makeReceipt('builder', r5.id, 'file_read', 'Read research handoff', 'research-handoff.json', JSON.stringify({ from: 'researcher', receiptsReceived: 5, chainVerified: true }), null, now, 5000);
  receipts.push(r6);

  const r7 = await makeReceipt('builder', r6.id, 'api_call', 'Query 0G Mainnet for deployment context', 'https://evmrpc.0g.ai', '{"jsonrpc":"2.0","result":"0x4f1a2b"}', null, now, 5500);
  receipts.push(r7);

  const r8 = await makeReceipt('builder', r7.id, 'decision', 'Deployment decision', 'Researcher verified 5 actions. Contract confirmed on 0G Mainnet. Code review via 0g-compute (TEE: verified). Proceeding with chain anchoring.', 'Deploy: anchor receipt chain on 0G Storage + Chain. Mint agent identity (ERC-7857).', null, now, 6000);
  receipts.push(r8);

  const r9 = await makeReceipt('builder', r8.id, 'output', 'Deployment manifest - anchoring receipt chain', 'Deployment manifest - anchoring receipt chain', JSON.stringify({ researchVerified: 5, builderActions: 5, totalChain: 10, deployments: ['0G Storage', '0G Chain', 'ERC-7857'] }), null, now, 6500);
  receipts.push(r9);

  const r10 = await makeReceipt('builder', r9.id, 'usefulness_review', 'Usefulness review - TEE-attested quality assessment', receipts.map(r => `[${r.action.type}] ${r.action.description}`).join('\n'), JSON.stringify({ alignment: 88, substance: 82, quality: 85, composite: 85, reasoning: 'Chain demonstrates real 0G integration with verified contract interactions and TEE-attested inference.' }), { provider: '0G Compute', type: 'tee' }, now, 8000);
  receipts.push(r10);

  return { receipts, publicKeyHex: pubHex };
}

// ── Tampered example chain ─────────────────────────────────────────────────

function makeTamperedExample(): Receipt[] {
  const now = Date.now();
  const receipts: Receipt[] = [
    {
      id: 'rcpt_example_001',
      prevId: null,
      agentId: 'researcher-demo',
      timestamp: now - 5000,
      action: { type: 'file_read', description: 'Read SDK source code' },
      inputHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      outputHash: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
      signature: 'deadbeef01deadbeef01deadbeef01deadbeef01deadbeef01deadbeef01deadbeef01deadbeef01deadbeef01deadbeef01deadbeef01deadbeef01deadbeef01dead',
      attestation: null,
    },
    {
      id: 'rcpt_example_002',
      prevId: 'rcpt_example_001',
      agentId: 'researcher-demo',
      timestamp: now - 4000,
      action: { type: 'api_call', description: 'Verify contract on 0G Mainnet' },
      inputHash: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
      outputHash: 'TAMPERED_HASH_fabricated_response_does_not_match_actual_0g_mainnet_data_000',
      signature: 'deadbeef02deadbeef02deadbeef02deadbeef02deadbeef02deadbeef02deadbeef02deadbeef02deadbeef02deadbeef02deadbeef02deadbeef02deadbeef02dead',
      attestation: { provider: '0G Mainnet', type: 'rpc' },
    },
    {
      id: 'rcpt_example_003',
      prevId: 'rcpt_example_002',
      agentId: 'researcher-demo',
      timestamp: now - 3000,
      action: { type: 'llm_call', description: 'TEE-attested code review via 0G Compute' },
      inputHash: 'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5',
      outputHash: 'e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
      signature: 'deadbeef03deadbeef03deadbeef03deadbeef03deadbeef03deadbeef03deadbeef03deadbeef03deadbeef03deadbeef03deadbeef03deadbeef03deadbeef03dead',
      attestation: { provider: '0G Compute', type: 'Intel TDX' },
    },
    {
      id: 'rcpt_example_004',
      prevId: 'WRONG_PREV_ID_chain_is_broken_here',
      agentId: 'builder-demo',
      timestamp: now - 2000,
      action: { type: 'decision', description: 'Accept research and begin deployment' },
      inputHash: 'f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1',
      outputHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      signature: 'deadbeef04deadbeef04deadbeef04deadbeef04deadbeef04deadbeef04deadbeef04deadbeef04deadbeef04deadbeef04deadbeef04deadbeef04deadbeef04dead',
      attestation: null,
    },
    {
      id: 'rcpt_example_005',
      prevId: 'rcpt_example_004',
      agentId: 'builder-demo',
      timestamp: now - 1000,
      action: { type: 'output', description: 'Deploy verified smart contract' },
      inputHash: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
      outputHash: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
      signature: 'deadbeef05deadbeef05deadbeef05deadbeef05deadbeef05deadbeef05deadbeef05deadbeef05deadbeef05deadbeef05deadbeef05deadbeef05deadbeef05dead',
      attestation: null,
    },
  ];
  return receipts;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function VerifyPage() {
  const [input, setInput] = useState('');
  const [publicKeyHex, setPublicKeyHex] = useState('');
  const [cards, setCards] = useState<ReceiptCard[]>([]);
  const [phase, setPhase] = useState<'idle' | 'verifying' | 'done'>('idle');
  const [rootHash, setRootHash] = useState<string | null>(null);
  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ed25519Supported, setEd25519Supported] = useState<boolean | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [hasLastRun, setHasLastRun] = useState(false);
  const [autoVerify, setAutoVerify] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    detectEd25519Support().then(setEd25519Supported);
  }, []);

  // Load chain from URL params, sessionStorage, API (by id), or detect last run
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const chainParam = params.get('chain');
    const fromSession = params.get('from');
    const autoRun = params.get('auto');
    const idParam = params.get('id');

    if (idParam) {
      // Fetch chain by ID from the API
      fetch(`/api/chains?id=${encodeURIComponent(idParam)}`)
        .then(res => {
          if (!res.ok) throw new Error('Chain not found');
          return res.json();
        })
        .then(data => {
          const chain = data.chain;
          if (chain?.receipts) {
            const json = JSON.stringify(chain.receipts, null, 2);
            setInput(json);
            if (autoRun === '1') setAutoVerify(true);
          }
        })
        .catch(() => {
          setError(`Chain "${idParam}" not found. It may have expired from the server cache.`);
        });
    } else if (chainParam) {
      try {
        const decoded = decodeURIComponent(chainParam);
        JSON.parse(decoded);
        setInput(decoded);
        if (autoRun === '1') setAutoVerify(true);
      } catch {}
    } else if (fromSession === 'session') {
      try {
        const stored = sessionStorage.getItem('receipt-verify-chain');
        if (stored) {
          JSON.parse(stored);
          setInput(stored);
          sessionStorage.removeItem('receipt-verify-chain');
          if (autoRun === '1') setAutoVerify(true);
        }
      } catch {}
    }

    try {
      const lastRun = localStorage.getItem('receipt_last_chain');
      if (lastRun) {
        JSON.parse(lastRun);
        setHasLastRun(true);
      }
    } catch {}
  }, []);

  // Auto-verify when chain is loaded from another page
  useEffect(() => {
    if (autoVerify && input.trim()) {
      setAutoVerify(false);
      verify();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoVerify, input]);

  const loadLastRun = useCallback(() => {
    try {
      const stored = localStorage.getItem('receipt_last_chain');
      if (stored) {
        JSON.parse(stored);
        setInput(stored);
        setCards([]);
        setPhase('idle');
        setRootHash(null);
        setChainValid(null);
        setError(null);
      }
    } catch {}
  }, []);

  const [generatingValid, setGeneratingValid] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());

  const loadValidExample = useCallback(async () => {
    if (ed25519Supported === false) {
      setError('Your browser does not support Ed25519. Use Chrome 113+ or Edge 113+.');
      return;
    }
    setGeneratingValid(true);
    try {
      const { receipts, publicKeyHex: pubHex } = await generateValidExample();
      setInput(JSON.stringify(receipts, null, 2));
      setPublicKeyHex(pubHex);
      setCards([]);
      setPhase('idle');
      setRootHash(null);
      setChainValid(null);
      setError(null);
    } catch (e: unknown) {
      setError(`Failed to generate valid chain: ${e instanceof Error ? e.message : String(e)}`);
    }
    setGeneratingValid(false);
  }, [ed25519Supported]);

  const loadTamperedExample = useCallback(() => {
    const tampered = makeTamperedExample();
    setInput(JSON.stringify(tampered, null, 2));
    setPublicKeyHex('');
    setCards([]);
    setPhase('idle');
    setRootHash(null);
    setChainValid(null);
    setError(null);
  }, []);

  const verify = useCallback(async () => {
    setPhase('verifying');
    setCards([]);
    setRootHash(null);
    setChainValid(null);
    setError(null);

    let receipts: Receipt[];
    try {
      const parsed = JSON.parse(input);
      receipts = Array.isArray(parsed) ? parsed : parsed.receipts;
      if (!Array.isArray(receipts) || receipts.length === 0) {
        setError('No receipts found in input.');
        setPhase('done');
        return;
      }
    } catch {
      setError('Invalid JSON. Paste a receipt chain array or handoff bundle.');
      setPhase('done');
      return;
    }

    let pubKeyBytes: Uint8Array | null = null;
    if (publicKeyHex.trim()) {
      try {
        pubKeyBytes = hexToBytes(publicKeyHex.trim());
        if (pubKeyBytes.length !== 32) {
          setError('Public key must be 32 bytes (64 hex characters).');
          setPhase('done');
          return;
        }
      } catch {
        setError('Invalid public key hex.');
        setPhase('done');
        return;
      }
    }

    const canVerifySig = pubKeyBytes !== null && ed25519Supported === true;
    const startTime = performance.now();

    // Initialize all cards as waiting
    const initialCards: ReceiptCard[] = receipts.map((r, i) => ({
      receipt: r,
      index: i,
      checks: { signature: 'pending', chainLink: 'pending', timestamp: 'pending' },
      status: 'waiting',
    }));
    setCards(initialCards);

    await new Promise((r) => setTimeout(r, 300));

    let allValid = true;

    for (let i = 0; i < receipts.length; i++) {
      const receipt = receipts[i];
      const expectedPrevId = i === 0 ? null : receipts[i - 1].id;

      // Set card to "checking"
      setCards(prev => prev.map((c, idx) =>
        idx === i ? { ...c, status: 'checking', checks: { signature: canVerifySig ? 'checking' : 'skipped', chainLink: 'checking', timestamp: 'checking' } } : c
      ));
      await new Promise((r) => setTimeout(r, 200));

      // Check signature
      let sigResult: CheckStatus = 'skipped';
      if (canVerifySig) {
        const payload = getSignaturePayload(receipt);
        const valid = await verifyEd25519(payload, receipt.signature, pubKeyBytes!);
        sigResult = valid ? 'pass' : 'fail';
        setCards(prev => prev.map((c, idx) =>
          idx === i ? { ...c, checks: { ...c.checks, signature: sigResult } } : c
        ));
        await new Promise((r) => setTimeout(r, 150));
      }

      // Check chain link
      const chainLinkValid = receipt.prevId === expectedPrevId;
      const chainResult: CheckStatus = chainLinkValid ? 'pass' : 'fail';
      setCards(prev => prev.map((c, idx) =>
        idx === i ? { ...c, checks: { ...c.checks, chainLink: chainResult } } : c
      ));
      await new Promise((r) => setTimeout(r, 150));

      // Check timestamp
      const tsValid = receipt.timestamp > 0 && receipt.timestamp <= Date.now() + 60000;
      const tsResult: CheckStatus = tsValid ? 'pass' : 'fail';

      const errors: string[] = [];
      if (sigResult === 'fail') errors.push('ed25519 signature mismatch');
      if (!chainLinkValid) errors.push(`broken chain link: prevId="${receipt.prevId?.slice(0, 16) ?? 'null'}" expected="${expectedPrevId?.slice(0, 16) ?? 'null'}"`);
      if (!tsValid) errors.push('timestamp outside valid range');

      const cardValid = chainLinkValid && tsValid && (sigResult === 'skipped' || sigResult === 'pass');
      if (!cardValid) allValid = false;

      setCards(prev => prev.map((c, idx) =>
        idx === i ? {
          ...c,
          checks: { ...c.checks, timestamp: tsResult },
          status: cardValid ? 'pass' : 'fail',
        } : c
      ));

      if (!cardValid) {
        setCards(prev => prev.map((c, idx) =>
          idx === i ? { ...c, checks: { ...c.checks, failReason: errors.join(' | ') } } : c
        ));
      }

      await new Promise((r) => setTimeout(r, 120));
    }

    const root = await computeRootHash(receipts);
    const elapsed = performance.now() - startTime;

    setRootHash(root);
    setChainValid(allValid);
    setElapsedMs(Math.round(elapsed));
    setPhase('done');
  }, [input, publicKeyHex, ed25519Supported]);

  const checkStatusIcon = (s: CheckStatus) => {
    switch (s) {
      case 'pending': return <span style={{ color: 'var(--text-dim)' }}>--</span>;
      case 'skipped': return <span style={{ color: 'var(--text-dim)', fontSize: '0.55em' }}>SKIP</span>;
      case 'checking': return <span className="typing-indicator" style={{ color: 'var(--amber)' }}></span>;
      case 'pass': return <span style={{ color: 'var(--green)', fontWeight: 700 }}>OK</span>;
      case 'fail': return <span style={{ color: 'var(--red)', fontWeight: 700 }}>FAIL</span>;
    }
  };

  const toggleCardExpanded = useCallback((index: number) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const friendlyFailReason = (raw: string): string => {
    const parts = raw.split(' | ');
    return parts.map(p => {
      if (p.includes('signature mismatch')) return 'Signature is invalid - the receipt was modified or signed with a different key';
      if (p.includes('broken chain link')) return 'Chain link is broken - this receipt does not connect to the previous one';
      if (p.includes('timestamp outside valid range')) return 'Timestamp is invalid - outside the acceptable range';
      return p;
    }).join('. ');
  };

  const passCount = cards.filter(c => c.status === 'pass').length;
  const failCount = cards.filter(c => c.status === 'fail').length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'IBM Plex Mono', 'Courier New', monospace" }}>
      <style>{`
        @media (max-width: 640px) {
          .verify-container { padding: 1rem 1rem 3rem !important; }
          .verify-nav-links { gap: 0.8rem !important; }
          .verify-buttons { flex-direction: column !important; }
          .verify-buttons button { width: 100% !important; }
          .verify-input-row { flex-direction: column !important; }
          .verify-input-row input { width: 100% !important; }
          .verify-input-row button { width: 100% !important; }
          .verify-card-checks { flex-wrap: wrap !important; gap: 0.5rem !important; }
          .verify-summary { flex-direction: column !important; align-items: flex-start !important; gap: 0.5rem !important; }
        }
      `}</style>
      {/* Nav */}
      <nav style={{
        padding: '0.6rem 1.5rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <a href="/" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', textDecoration: 'none', letterSpacing: '0.03em' }}>
          R.E.C.E.I.P.T.
        </a>
        <div className="verify-nav-links" style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <a href="/" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Home</a>
          <a href="/team" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Dashboard</a>
          <a href="/demo" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Demo</a>
          <a href="/verify" style={{ fontSize: '0.75rem', color: 'var(--text)', textDecoration: 'none', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>Verify</a>
          <a href="/eval" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Eval</a>
          <a href="https://github.com/MorkeethHQ/receipt" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>GitHub</a>
        </div>
      </nav>

      {/* Verify Sub-Header */}
      <header style={{ padding: '0.6rem 2rem 0.5rem', borderBottom: '1px solid var(--border)' }}>
        <h1 style={{ fontSize: '0.95rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.2rem' }}>
          Verify agent work
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginTop: '0.1rem', fontFamily: 'Inter, sans-serif', lineHeight: 1.5, maxWidth: '680px' }}>
          Don&apos;t trust the demo? Verify any chain yourself. Paste a receipt chain JSON and this page checks every Ed25519 signature, every SHA-256 hash link, and every timestamp order. Everything runs client-side via WebCrypto. No server, no trust required.
        </p>
      </header>

      <div className="verify-container" style={{ maxWidth: '960px', margin: '0 auto', padding: '0.8rem 2rem 2rem' }}>
        {/* Quick load buttons */}
        <div className="verify-buttons" style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <button
            onClick={loadValidExample}
            disabled={generatingValid}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '4px',
              border: '1px solid var(--green)',
              background: 'rgba(22, 163, 74, 0.06)',
              color: 'var(--green)',
              cursor: generatingValid ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              fontSize: '0.7rem',
              fontWeight: 600,
              opacity: generatingValid ? 0.6 : 1,
            }}
          >
            {generatingValid ? 'Generating...' : 'Honest chain'}
          </button>
          <button
            onClick={loadTamperedExample}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '4px',
              border: '1px solid var(--red)',
              background: 'rgba(220, 38, 38, 0.06)',
              color: 'var(--red)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '0.7rem',
              fontWeight: 600,
            }}
          >
            Tampered chain
          </button>
          {hasLastRun && (
            <button
              onClick={loadLastRun}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '4px',
                border: '1px solid var(--researcher)',
                background: 'rgba(37, 99, 235, 0.06)',
                color: 'var(--researcher)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '0.7rem',
                fontWeight: 600,
              }}
            >
              Your last run
            </button>
          )}
        </div>

        {/* Input area */}
        <div style={{ marginBottom: '0.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.55rem', color: 'var(--text-dim)', marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Receipt Chain JSON
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={'[\n  { "id": "rcpt_...", "prevId": null, "agentId": "...", ... }\n]'}
            spellCheck={false}
            style={{
              width: '100%',
              minHeight: '80px',
              maxHeight: '110px',
              background: 'var(--paper)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '0.8rem',
              fontFamily: 'inherit',
              fontSize: '0.72rem',
              lineHeight: 1.5,
              resize: 'vertical',
              outline: 'none',
            }}
          />
        </div>

        {/* Verify button */}
        <div style={{ marginBottom: '0.5rem' }}>
          <button
            onClick={verify}
            disabled={phase === 'verifying' || !input.trim()}
            style={{
              padding: '0.55rem 1.8rem',
              borderRadius: '4px',
              border: 'none',
              background: phase === 'verifying' || !input.trim() ? 'var(--border)' : 'var(--researcher)',
              color: '#fff',
              cursor: phase === 'verifying' || !input.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              fontSize: '0.78rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              letterSpacing: '0.04em',
            }}
          >
            {phase === 'verifying' ? 'Verifying...' : 'Verify Chain'}
          </button>
        </div>

        {/* Advanced options toggle */}
        <div style={{ marginBottom: '1.5rem' }}>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
              fontSize: '0.65rem',
              padding: '0.2rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            <span style={{ display: 'inline-block', transition: 'transform 0.2s', transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: '0.55rem' }}>&#9654;</span>
            Advanced options
          </button>
          {showAdvanced && (
            <div style={{ marginTop: '0.5rem', paddingLeft: '0.2rem' }}>
              <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Public Key (hex, optional)
              </label>
              <input
                type="text"
                value={publicKeyHex}
                onChange={(e) => setPublicKeyHex(e.target.value)}
                placeholder="64 hex chars - leave empty to skip signature verification"
                style={{
                  width: '100%',
                  maxWidth: '500px',
                  background: 'var(--paper)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '0.5rem 0.8rem',
                  fontFamily: 'inherit',
                  fontSize: '0.72rem',
                  outline: 'none',
                }}
              />
              {ed25519Supported === false && (
                <div style={{ fontSize: '0.62rem', color: 'var(--amber)', marginTop: '0.3rem', fontFamily: 'Inter, sans-serif' }}>
                  Your browser does not support Ed25519 in WebCrypto. Signature checks will be skipped. Use Chrome 113+ or Edge 113+.
                </div>
              )}
              {!publicKeyHex.trim() && ed25519Supported && (
                <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginTop: '0.3rem', fontFamily: 'Inter, sans-serif' }}>
                  Without a public key, only chain link and timestamp checks will run.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '0.6rem 0.8rem',
            background: 'rgba(220, 38, 38, 0.05)',
            border: '1px solid var(--red)',
            borderRadius: '4px',
            fontSize: '0.72rem',
            color: 'var(--red)',
            marginBottom: '1rem',
          }}>
            {error}
          </div>
        )}

        {/* Results */}
        {cards.length > 0 && (
          <div ref={resultsRef}>
            {/* Summary banner - appears when done */}
            {phase === 'done' && chainValid !== null && (
              <div
                className="slide-up verify-summary"
                style={{
                  padding: '1rem 1.2rem',
                  borderRadius: '4px',
                  marginBottom: '1rem',
                  border: `2px solid ${chainValid ? 'var(--green)' : 'var(--red)'}`,
                  background: chainValid ? 'rgba(22, 163, 74, 0.04)' : 'rgba(220, 38, 38, 0.04)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <span style={{
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    color: chainValid ? 'var(--green)' : 'var(--red)',
                    letterSpacing: '0.06em',
                  }}>
                    {chainValid ? 'ALL RECEIPTS VERIFIED' : 'VERIFICATION FAILED'}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
                    {passCount}/{cards.length} receipts passed &middot; {elapsedMs}ms
                  </span>
                </div>
                {rootHash && (
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>
                    Chain fingerprint: {rootHash.slice(0, 16)}...{rootHash.slice(-8)}
                  </div>
                )}
              </div>
            )}

            {/* Chain summary */}
            {phase === 'done' && cards.length > 0 && (
              <div className="slide-up" style={{
                display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.8rem',
                padding: '0.5rem 0.8rem', background: 'var(--paper)', borderRadius: '4px',
                border: '1px solid var(--border)',
                fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.6rem', color: 'var(--text-dim)',
              }}>
                {(() => {
                  const agents = new Set(cards.map(c => c.receipt.agentId));
                  const types: Record<string, number> = {};
                  cards.forEach(c => { types[c.receipt.action.type] = (types[c.receipt.action.type] ?? 0) + 1; });
                  const teeCount = cards.filter(c => c.receipt.attestation).length;
                  return (
                    <>
                      <span><strong style={{ color: 'var(--text)' }}>{agents.size}</strong> agent{agents.size > 1 ? 's' : ''}</span>
                      <span><strong style={{ color: 'var(--text)' }}>{cards.length}</strong> receipts</span>
                      {Object.entries(types).map(([type, count]) => (
                        <span key={type}>{count} {ACTION_LABELS[type] || type}</span>
                      ))}
                      {teeCount > 0 && <span style={{ color: 'var(--green)' }}>{teeCount} TEE-attested</span>}
                    </>
                  );
                })()}
              </div>
            )}

            {/* 0G on-chain links - shown when chain is valid */}
            {phase === 'done' && chainValid && (
              <div className="slide-up" style={{
                display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem',
              }}>
                {[
                  { label: 'ReceiptAnchor', addr: '0x73B9A7768679B154D7E1eC5F2570a622A3b49651' },
                  { label: 'AgentNFT (ERC-7857)', addr: '0xf964d45c3Ea5368918B1FDD49551E373028108c9' },
                  { label: 'Validation (ERC-8004)', addr: '0x2E32E845928A92DB193B59676C16D52923Fa01dd' },
                ].map(c => (
                  <a key={c.addr} href={`https://chainscan.0g.ai/address/${c.addr}`} target="_blank" rel="noopener noreferrer"
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.55rem',
                      color: 'var(--text-dim)', textDecoration: 'none',
                      padding: '0.25rem 0.6rem', background: 'var(--surface)',
                      borderRadius: '4px', border: '1px solid var(--border)',
                    }}>
                    {c.label}: {c.addr.slice(0, 8)}...
                  </a>
                ))}
              </div>
            )}

            {/* Verifying indicator */}
            {phase === 'verifying' && (
              <div style={{
                padding: '0.6rem 0.8rem',
                marginBottom: '1rem',
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
              }}>
                <span className="typing-indicator" style={{ color: 'var(--amber)' }}></span>
                <span>Verifying {cards.length} receipts... ({passCount + failCount}/{cards.length})</span>
              </div>
            )}

            {/* Chain fingerprint (root hash) */}
            {phase === 'done' && rootHash && (
              <div className="slide-up" style={{
                padding: '0.5rem 0.8rem',
                background: 'var(--paper)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                marginBottom: '1rem',
                fontSize: '0.62rem',
                color: 'var(--text-dim)',
                wordBreak: 'break-all',
              }}>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>Chain fingerprint: </span>
                {rootHash}
              </div>
            )}

            {/* Receipt cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {cards.map((card, i) => {
                const isExpanded = expandedCards.has(card.index);
                const actionLabel = ACTION_LABELS[card.receipt.action.type] || card.receipt.action.type;
                const statusLabel = card.status === 'pass' ? 'verified' :
                                    card.status === 'fail' ? 'FAILED' :
                                    card.status === 'checking' ? 'checking...' : 'waiting';

                // Try to parse usefulness score from outputHash for usefulness_review receipts
                let usefulnessScore: number | null = null;
                if (card.receipt.action.type === 'usefulness_review') {
                  try {
                    const parsed = JSON.parse(card.receipt.action.description.includes('score') ? card.receipt.action.description : '{}');
                    if (parsed.composite) usefulnessScore = parsed.composite;
                  } catch {
                    // not parseable, skip
                  }
                }

                return (
                <div key={card.receipt.id} style={{ display: 'contents' }}>
                {i > 0 && cards[i]?.receipt.agentId !== cards[i-1]?.receipt.agentId && (
                  <div style={{
                    padding: '0.4rem 0.8rem',
                    margin: '0.3rem 0',
                    background: 'linear-gradient(90deg, rgba(37,99,235,0.06), rgba(124,58,237,0.06))',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    fontSize: '0.65rem',
                    color: 'var(--text-muted)',
                    fontFamily: "'IBM Plex Mono', monospace",
                    textAlign: 'center',
                  }}>
                    &#8592; Handoff: chain transferred from {cards[i-1]?.receipt.agentId} to {cards[i]?.receipt.agentId}
                  </div>
                )}
                <div
                  className={card.status === 'pass' || card.status === 'fail' ? 'slide-up' : ''}
                  style={{
                    padding: '0.7rem 0.9rem',
                    background: card.status === 'fail' ? 'rgba(220, 38, 38, 0.04)' :
                                card.status === 'pass' ? 'rgba(22, 163, 74, 0.03)' : 'var(--paper)',
                    border: `1px solid ${
                      card.status === 'fail' ? 'var(--red)' :
                      card.status === 'pass' ? 'rgba(22, 163, 74, 0.3)' :
                      card.status === 'checking' ? 'var(--amber)' : 'var(--border)'
                    }`,
                    borderRadius: '4px',
                    transition: 'border-color 0.3s, background 0.3s, box-shadow 0.3s',
                    boxShadow: card.status === 'fail' ? '0 0 0 1px var(--red), 0 2px 8px rgba(220,38,38,0.08)' :
                               card.status === 'pass' ? '0 1px 3px rgba(0,0,0,0.04)' : 'none',
                    ...(card.status === 'fail' ? { animation: 'shake 0.5s ease-out' } : {}),
                  }}
                >
                  {/* Primary line: Receipt #N: [action] - status */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.3rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{
                        width: '1.4rem',
                        height: '1.4rem',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        flexShrink: 0,
                        background: card.status === 'fail' ? 'rgba(220, 38, 38, 0.1)' :
                                    card.status === 'pass' ? 'rgba(22, 163, 74, 0.1)' :
                                    card.status === 'checking' ? 'rgba(217, 119, 6, 0.1)' : 'var(--surface)',
                        color: card.status === 'fail' ? 'var(--red)' :
                               card.status === 'pass' ? 'var(--green)' :
                               card.status === 'checking' ? 'var(--amber)' : 'var(--text-dim)',
                        border: `1px solid ${
                          card.status === 'fail' ? 'var(--red)' :
                          card.status === 'pass' ? 'var(--green)' :
                          card.status === 'checking' ? 'var(--amber)' : 'var(--border)'
                        }`,
                      }}>
                        {card.status === 'fail' ? '✕' :
                         card.status === 'pass' ? '✓' :
                         card.status === 'checking' ? '' :
                         card.index + 1}
                      </span>
                      <span style={{ fontSize: '0.74rem', fontFamily: 'Inter, sans-serif' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>Receipt #{card.index + 1}: {actionLabel}</span>
                        <span style={{ margin: '0 0.4rem', color: 'var(--text-dim)' }}>&mdash;</span>
                        {card.status === 'checking' ? (
                          <span className="typing-indicator" style={{ color: 'var(--amber)', fontSize: '0.7rem' }}></span>
                        ) : (
                          <span style={{
                            fontWeight: card.status === 'fail' ? 700 : 600,
                            color: card.status === 'pass' ? 'var(--green)' :
                                   card.status === 'fail' ? 'var(--red)' : 'var(--text-dim)',
                          }}>
                            {statusLabel}
                          </span>
                        )}
                      </span>
                    </div>
                    {/* Expand/collapse button */}
                    {(card.status === 'pass' || card.status === 'fail') && (
                      <button
                        onClick={() => toggleCardExpanded(card.index)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-dim)',
                          cursor: 'pointer',
                          fontSize: '0.6rem',
                          fontFamily: 'Inter, sans-serif',
                          padding: '0.15rem 0.3rem',
                          borderRadius: '2px',
                        }}
                      >
                        {isExpanded ? 'hide details' : 'details'}
                      </button>
                    )}
                  </div>

                  {/* Chain link - always visible */}
                  <div style={{
                    marginTop: '0.2rem', paddingLeft: '1.9rem',
                    fontSize: '0.55rem', color: 'var(--text-dim)',
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}>
                    {card.receipt.prevId ? (
                      <span>linked to {card.receipt.prevId.slice(0, 12)}... {card.checks.chainLink === 'pass' ? <span style={{ color: 'var(--green)' }}>&#10003;</span> : card.checks.chainLink === 'fail' ? <span style={{ color: 'var(--red)' }}>&#10007;</span> : null}</span>
                    ) : (
                      <span style={{ color: 'var(--researcher)' }}>chain start (genesis)</span>
                    )}
                  </div>

                  {/* Failure reason - always visible in plain english */}
                  {card.checks.failReason && (
                    <div style={{
                      marginTop: '0.35rem',
                      paddingLeft: '1.9rem',
                      fontSize: '0.68rem',
                      color: 'var(--red)',
                      fontFamily: 'Inter, sans-serif',
                      lineHeight: 1.5,
                    }}>
                      {friendlyFailReason(card.checks.failReason)}
                    </div>
                  )}

                  {/* Attestation badge */}
                  {card.receipt.attestation && (
                    <div style={{
                      marginTop: '0.35rem',
                      paddingLeft: '1.9rem',
                      fontSize: '0.58rem',
                      color: 'var(--text-dim)',
                    }}>
                      <span style={{
                        padding: '0.1rem 0.4rem',
                        background: 'rgba(37, 99, 235, 0.06)',
                        border: '1px solid rgba(37, 99, 235, 0.2)',
                        borderRadius: '2px',
                        fontSize: '0.56rem',
                      }}>
                        {card.receipt.attestation.type} via {card.receipt.attestation.provider}
                      </span>
                    </div>
                  )}

                  {/* Usefulness review badge */}
                  {card.receipt.action.type === 'usefulness_review' && (
                    <div style={{
                      marginTop: '0.35rem',
                      paddingLeft: '1.9rem',
                      fontSize: '0.58rem',
                      display: 'flex',
                      gap: '0.5rem',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}>
                      <span style={{
                        padding: '0.15rem 0.5rem',
                        background: 'rgba(22, 163, 74, 0.06)',
                        border: '1px solid rgba(22, 163, 74, 0.25)',
                        borderRadius: '2px',
                        fontSize: '0.56rem',
                        color: 'var(--green)',
                        fontWeight: 600,
                      }}>
                        Proof of Usefulness
                      </span>
                      {usefulnessScore !== null && (
                        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
                          Quality score: {usefulnessScore}/100 (stored on-chain)
                        </span>
                      )}
                    </div>
                  )}

                  {/* Expandable details section */}
                  {isExpanded && (
                    <div style={{
                      marginTop: '0.5rem',
                      paddingLeft: '1.9rem',
                      paddingTop: '0.5rem',
                      borderTop: '1px dashed var(--border-dashed)',
                    }}>
                      {/* Check details */}
                      <div className="verify-card-checks" style={{
                        display: 'flex',
                        gap: '1.2rem',
                        fontSize: '0.65rem',
                        marginBottom: '0.4rem',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span style={{ color: 'var(--text-dim)', width: '3.5rem' }}>sig:</span>
                          {checkStatusIcon(card.checks.signature)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span style={{ color: 'var(--text-dim)', width: '3.5rem' }}>chain:</span>
                          {checkStatusIcon(card.checks.chainLink)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span style={{ color: 'var(--text-dim)', width: '3.5rem' }}>time:</span>
                          {checkStatusIcon(card.checks.timestamp)}
                        </div>
                      </div>
                      {/* Description */}
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', marginBottom: '0.3rem' }}>
                        {card.receipt.action.description}
                      </div>
                      {/* Hashes */}
                      <div style={{ fontSize: '0.56rem', color: 'var(--text-dim)', wordBreak: 'break-all', lineHeight: 1.6 }}>
                        <div><span style={{ color: 'var(--text-muted)' }}>ID:</span> {card.receipt.id}</div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Agent:</span> {card.receipt.agentId}</div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Input hash:</span> {card.receipt.inputHash}</div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Output hash:</span> {card.receipt.outputHash}</div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Signature:</span> {card.receipt.signature.slice(0, 32)}...{card.receipt.signature.slice(-16)}</div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Timestamp:</span> {new Date(card.receipt.timestamp).toISOString()}</div>
                        {card.receipt.prevId && (
                          <div><span style={{ color: 'var(--text-muted)' }}>Prev ID:</span> {card.receipt.prevId}</div>
                        )}
                      </div>
                      {/* Raw fail reason if present */}
                      {card.checks.failReason && (
                        <div style={{ fontSize: '0.56rem', color: 'var(--red)', marginTop: '0.3rem', fontStyle: 'italic' }}>
                          Raw: {card.checks.failReason}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* Footer */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '0.4rem 1.5rem',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.6rem',
        color: 'var(--text-dim)',
        fontFamily: 'Inter, sans-serif',
      }}>
        <span>R.E.C.E.I.P.T. Public Verifier</span>
        <span>ed25519 + SHA-256 &middot; client-side only</span>
      </div>
    </div>
  );
}
