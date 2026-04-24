'use client';

import { useState, useCallback } from 'react';

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

interface CheckResult {
  signature: boolean | null; // null = pending/skipped
  chainLink: boolean;
  timestamp: boolean;
}

interface ReceiptResult {
  receiptId: string;
  index: number;
  checks: CheckResult;
  valid: boolean;
  error?: string;
}

interface VerifyState {
  status: 'idle' | 'verifying' | 'done';
  results: ReceiptResult[];
  rootHash: string | null;
  chainValid: boolean | null;
  publicKey: string | null;
  error: string | null;
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
    // Browser does not support Ed25519 in WebCrypto
    return false;
  }
}

async function computeRootHash(receipts: Receipt[]): Promise<string> {
  if (receipts.length === 0) return '';
  const last = receipts[receipts.length - 1];
  return sha256Hex(`${last.id}:${last.inputHash}:${last.outputHash}:${last.signature}`);
}

// ── Detect Ed25519 support ─────────────────────────────────────────────────

async function detectEd25519Support(): Promise<boolean> {
  try {
    const kp = await crypto.subtle.generateKey({ name: 'Ed25519' } as Algorithm, false, ['sign', 'verify']);
    return !!kp;
  } catch {
    return false;
  }
}

// ── Sample data ────────────────────────────────────────────────────────────

const SAMPLE_PLACEHOLDER = `[
  {
    "id": "...",
    "prevId": null,
    "agentId": "agent-a",
    "timestamp": 1713900000000,
    "action": { "type": "file_read", "description": "Read config" },
    "inputHash": "abc123...",
    "outputHash": "def456...",
    "signature": "...",
    "attestation": null
  }
]`;

// ── Component ──────────────────────────────────────────────────────────────

export default function VerifyPage() {
  const [input, setInput] = useState('');
  const [publicKeyHex, setPublicKeyHex] = useState('');
  const [state, setState] = useState<VerifyState>({
    status: 'idle',
    results: [],
    rootHash: null,
    chainValid: null,
    publicKey: null,
    error: null,
  });
  const [ed25519Supported, setEd25519Supported] = useState<boolean | null>(null);

  // Check on first render
  useState(() => {
    detectEd25519Support().then(setEd25519Supported);
  });

  const verify = useCallback(async () => {
    setState({ status: 'verifying', results: [], rootHash: null, chainValid: null, publicKey: null, error: null });

    let receipts: Receipt[];
    try {
      const parsed = JSON.parse(input);
      // Support both raw array and HandoffBundle format
      receipts = Array.isArray(parsed) ? parsed : parsed.receipts;
      if (!Array.isArray(receipts) || receipts.length === 0) {
        setState((s) => ({ ...s, status: 'done', error: 'No receipts found in input.' }));
        return;
      }
    } catch {
      setState((s) => ({ ...s, status: 'done', error: 'Invalid JSON. Paste a receipt chain array or handoff bundle.' }));
      return;
    }

    // Resolve public key
    let pubKeyBytes: Uint8Array | null = null;
    if (publicKeyHex.trim()) {
      try {
        pubKeyBytes = hexToBytes(publicKeyHex.trim());
        if (pubKeyBytes.length !== 32) {
          setState((s) => ({ ...s, status: 'done', error: 'Public key must be 32 bytes (64 hex characters).' }));
          return;
        }
      } catch {
        setState((s) => ({ ...s, status: 'done', error: 'Invalid public key hex.' }));
        return;
      }
    }

    const canVerifySig = pubKeyBytes !== null && ed25519Supported === true;
    const results: ReceiptResult[] = [];
    let allValid = true;

    for (let i = 0; i < receipts.length; i++) {
      const receipt = receipts[i];
      const expectedPrevId = i === 0 ? null : receipts[i - 1].id;

      // Chain link check
      const chainLink = receipt.prevId === expectedPrevId;

      // Timestamp check
      const timestamp = receipt.timestamp > 0 && receipt.timestamp <= Date.now() + 60000;

      // Signature check
      let signature: boolean | null = null;
      if (canVerifySig) {
        const payload = getSignaturePayload(receipt);
        signature = await verifyEd25519(payload, receipt.signature, pubKeyBytes!);
      }

      const valid = chainLink && timestamp && (signature === null || signature === true);
      if (!valid) allValid = false;

      const errors: string[] = [];
      if (!chainLink) errors.push('broken chain link');
      if (!timestamp) errors.push('invalid timestamp');
      if (signature === false) errors.push('invalid signature');

      const result: ReceiptResult = {
        receiptId: receipt.id,
        index: i,
        checks: { signature, chainLink, timestamp },
        valid,
        error: errors.length > 0 ? errors.join(', ') : undefined,
      };

      results.push(result);
      setState((s) => ({ ...s, results: [...results] }));

      // Small delay for visual effect
      await new Promise((r) => setTimeout(r, 40));
    }

    const rootHash = await computeRootHash(receipts);

    setState({
      status: 'done',
      results,
      rootHash,
      chainValid: allValid,
      publicKey: pubKeyBytes ? bytesToHex(pubKeyBytes) : null,
      error: null,
    });
  }, [input, publicKeyHex, ed25519Supported]);

  const checkIcon = (val: boolean | null) => {
    if (val === null) return <span style={{ color: '#666' }}>--</span>;
    return val
      ? <span style={{ color: 'var(--green)' }}>OK</span>
      : <span style={{ color: 'var(--red)' }}>FAIL</span>;
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace" }}>
      {/* Header */}
      <header style={{ padding: '1.5rem 2rem 1rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', letterSpacing: '-0.02em', marginBottom: '0.2rem' }}>
              <span style={{ color: 'var(--accent)' }}>R</span>.<span style={{ color: 'var(--green)' }}>E</span>.<span style={{ color: 'var(--orange)' }}>C</span>.<span style={{ color: 'var(--purple)' }}>E</span>.<span style={{ color: 'var(--accent)' }}>I</span>.<span style={{ color: 'var(--green)' }}>P</span>.<span style={{ color: 'var(--orange)' }}>T</span>.{' '}
              <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem', fontWeight: 400 }}>/ verify</span>
            </h1>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '0.2rem' }}>
              Paste a receipt chain JSON and verify integrity client-side
            </p>
          </div>
          <a
            href="/"
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-dim)',
              textDecoration: 'none',
              border: '1px solid var(--border)',
              padding: '0.3rem 0.8rem',
              borderRadius: '4px',
            }}
          >
            Back to demo
          </a>
        </div>
      </header>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem 2rem' }}>
        {/* Input area */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Receipt Chain JSON
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={SAMPLE_PLACEHOLDER}
            spellCheck={false}
            style={{
              width: '100%',
              minHeight: '200px',
              background: 'var(--surface)',
              color: 'var(--text)',
              border: `1px solid var(--border)`,
              borderRadius: '8px',
              padding: '0.8rem',
              fontFamily: 'inherit',
              fontSize: '0.75rem',
              lineHeight: 1.5,
              resize: 'vertical',
              outline: 'none',
            }}
          />
        </div>

        {/* Public key input */}
        <div style={{ marginBottom: '1.2rem' }}>
          <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                background: 'var(--surface)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '0.5rem 0.8rem',
                fontFamily: 'inherit',
                fontSize: '0.75rem',
                outline: 'none',
              }}
            />
            <button
              onClick={verify}
              disabled={state.status === 'verifying' || !input.trim()}
              style={{
                padding: '0.5rem 1.5rem',
                borderRadius: '6px',
                border: 'none',
                background: state.status === 'verifying' || !input.trim() ? '#222' : 'var(--accent)',
                color: '#fff',
                cursor: state.status === 'verifying' || !input.trim() ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                fontSize: '0.8rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {state.status === 'verifying' ? 'Verifying...' : 'Verify'}
            </button>
          </div>
          {ed25519Supported === false && (
            <div style={{ fontSize: '0.65rem', color: 'var(--orange)', marginTop: '0.3rem' }}>
              Your browser does not support Ed25519 in WebCrypto. Signature checks will be skipped. Use Chrome 113+ or Edge 113+.
            </div>
          )}
          {!publicKeyHex.trim() && ed25519Supported && (
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '0.3rem' }}>
              Without a public key, only chain link and timestamp checks will run.
            </div>
          )}
        </div>

        {/* Error */}
        {state.error && (
          <div style={{
            padding: '0.6rem 0.8rem',
            background: '#1a0808',
            border: '1px solid var(--red)',
            borderRadius: '6px',
            fontSize: '0.75rem',
            color: 'var(--red)',
            marginBottom: '1rem',
          }}>
            {state.error}
          </div>
        )}

        {/* Results */}
        {state.results.length > 0 && (
          <div>
            {/* Summary banner */}
            {state.status === 'done' && state.chainValid !== null && (
              <div
                style={{
                  padding: '0.8rem 1rem',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  border: `2px solid ${state.chainValid ? 'var(--green)' : 'var(--red)'}`,
                  background: state.chainValid ? '#0a1a0a' : '#1a0808',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{
                    fontSize: '1.2rem',
                    fontWeight: 700,
                    color: state.chainValid ? 'var(--green)' : 'var(--red)',
                    letterSpacing: '0.05em',
                  }}>
                    {state.chainValid ? 'CHAIN VALID' : 'CHAIN BROKEN'}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                    {state.results.filter((r) => r.valid).length}/{state.results.length} receipts passed
                  </span>
                </div>
                {state.rootHash && (
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                    root: {state.rootHash.slice(0, 16)}...{state.rootHash.slice(-8)}
                  </div>
                )}
              </div>
            )}

            {/* Root hash */}
            {state.status === 'done' && state.rootHash && (
              <div style={{
                padding: '0.5rem 0.8rem',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                marginBottom: '1rem',
                fontSize: '0.65rem',
                color: 'var(--text-dim)',
                fontFamily: 'monospace',
                wordBreak: 'break-all',
              }}>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>Root Hash: </span>
                {state.rootHash}
              </div>
            )}

            {/* Individual receipts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {state.results.map((r) => (
                <div
                  key={r.receiptId}
                  className="pulse-in"
                  style={{
                    padding: '0.6rem 0.8rem',
                    background: r.valid ? '#0c0c14' : '#1a0808',
                    border: `1px solid ${r.valid ? '#22c55e22' : '#ef444444'}`,
                    borderRadius: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.3rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{
                        color: r.valid ? 'var(--green)' : 'var(--red)',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        width: '1.2rem',
                        textAlign: 'center',
                      }}>
                        {r.valid ? '~' : 'x'}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                        #{r.index + 1}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#555', fontFamily: 'monospace' }}>
                        {r.receiptId.slice(0, 12)}...
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.8rem', fontSize: '0.65rem' }}>
                      <span>
                        <span style={{ color: '#555' }}>sig: </span>
                        {checkIcon(r.checks.signature)}
                      </span>
                      <span>
                        <span style={{ color: '#555' }}>chain: </span>
                        {checkIcon(r.checks.chainLink)}
                      </span>
                      <span>
                        <span style={{ color: '#555' }}>time: </span>
                        {checkIcon(r.checks.timestamp)}
                      </span>
                    </div>
                  </div>
                  {r.error && (
                    <div style={{ fontSize: '0.6rem', color: 'var(--red)', marginTop: '0.3rem', paddingLeft: '1.7rem' }}>
                      {r.error}
                    </div>
                  )}
                </div>
              ))}
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
        borderTop: '1px solid #1a1a1a',
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.65rem',
        color: '#444',
      }}>
        <span>R.E.C.E.I.P.T. Public Verifier</span>
        <span>All verification runs client-side. No data leaves your browser.</span>
      </div>
    </div>
  );
}
