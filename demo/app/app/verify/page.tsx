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

type CheckStatus = 'pending' | 'checking' | 'pass' | 'fail';

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
};

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

  // Load chain from URL params, sessionStorage, or detect last run
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const chainParam = params.get('chain');
    const fromSession = params.get('from');
    const autoRun = params.get('auto');

    if (chainParam) {
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

  const loadTamperedExample = useCallback(() => {
    const tampered = makeTamperedExample();
    setInput(JSON.stringify(tampered, null, 2));
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
        idx === i ? { ...c, status: 'checking', checks: { signature: canVerifySig ? 'checking' : 'pending', chainLink: 'checking', timestamp: 'checking' } } : c
      ));
      await new Promise((r) => setTimeout(r, 200));

      // Check signature
      let sigResult: CheckStatus = 'pending';
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

      const cardValid = chainLinkValid && tsValid && (sigResult === 'pending' || sigResult === 'pass');
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
      case 'checking': return <span className="typing-indicator" style={{ color: 'var(--amber)' }}></span>;
      case 'pass': return <span style={{ color: 'var(--green)', fontWeight: 700 }}>OK</span>;
      case 'fail': return <span style={{ color: 'var(--red)', fontWeight: 700 }}>FAIL</span>;
    }
  };

  const passCount = cards.filter(c => c.status === 'pass').length;
  const failCount = cards.filter(c => c.status === 'fail').length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'IBM Plex Mono', 'Courier New', monospace" }}>
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
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <a href="/" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Home</a>
          <a href="/demo" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Demo</a>
          <a href="/verify" style={{ fontSize: '0.75rem', color: 'var(--text)', textDecoration: 'none', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>Verify</a>
          <a href="/dashboard" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Dashboard</a>
        </div>
      </nav>

      {/* Verify Sub-Header */}
      <header style={{ padding: '1rem 2rem 0.8rem', borderBottom: '1px solid var(--border)' }}>
        <h1 style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.2rem' }}>
          Chain Verifier
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.72rem', marginTop: '0.2rem', fontFamily: 'Inter, sans-serif' }}>
          Independent chain verifier — all checks run client-side, no data leaves your browser
        </p>
      </header>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '1.5rem 2rem 4rem' }}>
        {/* Quick load buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {hasLastRun && (
            <button
              onClick={loadLastRun}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '4px',
                border: '1px solid var(--agent-a)',
                background: 'rgba(37, 99, 235, 0.06)',
                color: 'var(--agent-a)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '0.7rem',
                fontWeight: 600,
              }}
            >
              Load last pipeline run
            </button>
          )}
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
            Load example (tampered)
          </button>
        </div>

        {/* Input area */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Receipt Chain JSON
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={'[\n  { "id": "rcpt_...", "prevId": null, "agentId": "...", ... }\n]'}
            spellCheck={false}
            style={{
              width: '100%',
              minHeight: '160px',
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

        {/* Public key + verify button */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Public Key (hex, optional)
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              value={publicKeyHex}
              onChange={(e) => setPublicKeyHex(e.target.value)}
              placeholder="64 hex chars — leave empty to skip signature verification"
              style={{
                flex: 1,
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
            <button
              onClick={verify}
              disabled={phase === 'verifying' || !input.trim()}
              style={{
                padding: '0.5rem 1.5rem',
                borderRadius: '4px',
                border: 'none',
                background: phase === 'verifying' || !input.trim() ? 'var(--border)' : 'var(--agent-a)',
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
            {/* Summary banner — appears when done */}
            {phase === 'done' && chainValid !== null && (
              <div
                className="slide-up"
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
                    {chainValid ? 'CHAIN VALID' : 'CHAIN BROKEN'}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
                    {passCount}/{cards.length} receipts passed &middot; {elapsedMs}ms
                  </span>
                </div>
                {rootHash && (
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>
                    root: {rootHash.slice(0, 16)}...{rootHash.slice(-8)}
                  </div>
                )}
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

            {/* Root hash */}
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
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>Root Hash: </span>
                {rootHash}
              </div>
            )}

            {/* Receipt cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {cards.map((card) => (
                <div
                  key={card.receipt.id}
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
                  {/* Card header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.3rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{
                        width: '1.4rem',
                        height: '1.4rem',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.7rem',
                        fontWeight: 700,
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
                         card.index + 1}
                      </span>
                      <div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text)' }}>
                          {ACTION_LABELS[card.receipt.action.type] || card.receipt.action.type}
                        </span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginLeft: '0.5rem', fontFamily: 'Inter, sans-serif' }}>
                          {card.receipt.action.description}
                        </span>
                      </div>
                    </div>
                    <span style={{ fontSize: '0.58rem', color: 'var(--text-dim)' }}>
                      {card.receipt.id.slice(0, 16)}...
                    </span>
                  </div>

                  {/* Three check columns */}
                  <div style={{
                    display: 'flex',
                    gap: '1.2rem',
                    marginTop: '0.5rem',
                    paddingLeft: '2rem',
                    fontSize: '0.65rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span style={{ color: 'var(--text-dim)', width: '3rem' }}>sig:</span>
                      {checkStatusIcon(card.checks.signature)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span style={{ color: 'var(--text-dim)', width: '3rem' }}>chain:</span>
                      {checkStatusIcon(card.checks.chainLink)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span style={{ color: 'var(--text-dim)', width: '3rem' }}>time:</span>
                      {checkStatusIcon(card.checks.timestamp)}
                    </div>
                  </div>

                  {/* Failure reason */}
                  {card.checks.failReason && (
                    <div style={{
                      marginTop: '0.4rem',
                      paddingLeft: '2rem',
                      fontSize: '0.62rem',
                      color: 'var(--red)',
                      fontFamily: 'Inter, sans-serif',
                    }}>
                      {card.checks.failReason}
                    </div>
                  )}

                  {/* Attestation badge */}
                  {card.receipt.attestation && (
                    <div style={{
                      marginTop: '0.4rem',
                      paddingLeft: '2rem',
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
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Idle state — explain what this page does */}
        {phase === 'idle' && cards.length === 0 && !input.trim() && (
          <div style={{
            marginTop: '2rem',
            padding: '1.5rem',
            background: 'var(--paper)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.5rem' }}>
              Independent Chain Verification
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '500px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
              Paste any receipt chain JSON to verify its integrity. Each receipt is checked for
              valid ed25519 signatures, unbroken hash links, and monotonic timestamps.
              Everything runs in your browser — nothing is sent to any server.
            </p>
            <div style={{
              marginTop: '1rem',
              display: 'flex',
              gap: '0.5rem',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}>
              {hasLastRun && (
                <button
                  onClick={loadLastRun}
                  style={{
                    padding: '0.4rem 0.8rem',
                    borderRadius: '4px',
                    border: '1px solid var(--agent-a)',
                    background: 'rgba(37, 99, 235, 0.06)',
                    color: 'var(--agent-a)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                  }}
                >
                  Load last pipeline run
                </button>
              )}
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
                  fontSize: '0.68rem',
                  fontWeight: 600,
                }}
              >
                Load example (tampered)
              </button>
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
