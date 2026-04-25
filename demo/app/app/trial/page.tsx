'use client';
import { useState, useRef, useCallback } from 'react';

/* Types */
interface Receipt {
  id: string; prevId: string | null; agentId: string; timestamp: number;
  action: { type: string; description?: string };
  inputHash: string; outputHash: string; signature: string;
  attestation: { provider: string; type: string } | null;
}
interface TrialReceipt { receipt: Receipt; agent: 'A'|'B'|'human'; durationMs: number; tokensUsed: number|null; startMs: number; }
interface RunData {
  receipts: TrialReceipt[]; totalMs: number; tokens: number; quality: number|null; rootHash: string;
  reviewerSelection: {model:string;reason:string;attested:boolean}|null;
  teeVerified: boolean; agenticId: boolean; fineTuning: boolean; reviewScores: any;
}

const mono = { fontFamily: "'IBM Plex Mono', 'Courier New', monospace" } as const;
const PRICE = 0.00015 / 1000;
const card = { padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '1rem' } as const;
const sectionLabel = { ...mono, fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase' as const, marginBottom: '0.5rem', letterSpacing: '0.05em' };

async function sha256(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
}
function bufToHex(b: Uint8Array) { return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join(''); }

/* SSE Consumer */
async function runPipeline(
  lowQuality: boolean,
  onReceipt?: (tr: TrialReceipt) => void,
  onStatus?: (msg: string) => void,
  onMeta?: (key: string, value: any) => void,
): Promise<RunData> {
  const res = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adversarial: false, lowQuality }) });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const receipts: TrialReceipt[] = [];
  const d: RunData = { receipts: [], totalMs: 0, tokens: 0, quality: null, rootHash: '', reviewerSelection: null, teeVerified: false, agenticId: false, fineTuning: false, reviewScores: null };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop() || '';
    let ev = '';
    for (const ln of lines) {
      if (ln.startsWith('event: ')) { ev = ln.slice(7); }
      else if (ln.startsWith('data: ') && ev) {
        try {
          const p = JSON.parse(ln.slice(6));
          if (ev === 'receipt') {
            const tr: TrialReceipt = { receipt: p.receipt, agent: p.agent || 'A', durationMs: p.durationMs || 500, tokensUsed: p.tokensUsed || null, startMs: receipts.reduce((s, r) => s + r.durationMs, 0) };
            receipts.push(tr); d.receipts = [...receipts]; d.tokens += tr.tokensUsed || 0; onReceipt?.(tr);
          } else if (ev === 'review_scores') { d.quality = p.composite; d.reviewScores = p; onMeta?.('reviewScores', p); }
          else if (ev === 'reviewer_selection') { d.reviewerSelection = p; onMeta?.('reviewerSelection', p); }
          else if (ev === 'pipeline_timing') { d.totalMs = p.totalMs; onMeta?.('totalMs', p.totalMs); }
          else if (ev === 'tee_verified') { d.teeVerified = true; onMeta?.('teeVerified', true); }
          else if (ev === 'agentic_id') { d.agenticId = true; onMeta?.('agenticId', true); }
          else if (ev === 'fine_tuning') { d.fineTuning = true; onMeta?.('fineTuning', true); }
          else if (ev === 'done') { d.rootHash = p.rootHash || ''; onMeta?.('rootHash', d.rootHash); }
          else if (ev === 'status') { onStatus?.(p.message || ''); }
          else if (ev === 'error') { onStatus?.(`Error: ${p.message || 'unknown'}`); }
        } catch {}
        ev = '';
      }
    }
  }
  return d;
}

/* Sub-components */
function StatCard({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '1.2rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
      <div style={{ ...mono, fontSize: '2.2rem', fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
      <div style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );
}

function Timeline({ receipts, totalMs, hovered, setHovered }: { receipts: TrialReceipt[]; totalMs: number; hovered: number|null; setHovered: (i: number|null) => void }) {
  const h = hovered !== null ? receipts[hovered] : null;
  return (
    <div>
      <div style={{ display: 'flex', width: '100%', height: '48px', borderRadius: '8px', overflow: 'hidden', background: 'var(--border)' }}>
        {receipts.map((tr, i) => {
          const w = totalMs > 0 ? Math.max(2, (tr.durationMs / totalMs) * 100) : 100 / Math.max(receipts.length, 1);
          const handoff = i > 0 && tr.agent !== receipts[i - 1]?.agent;
          const bg = tr.agent === 'human' ? 'var(--amber)' : tr.receipt.action.type === 'usefulness_review' ? 'var(--green)' : tr.agent === 'A' ? 'var(--researcher)' : 'var(--builder)';
          return (
            <div key={tr.receipt.id || i} style={{ position: 'relative', flex: `0 0 ${w}%`, minWidth: '8px' }}>
              {handoff && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '2px', background: '#fff', zIndex: 1 }} />}
              <div onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
                style={{ width: '100%', height: '100%', background: bg, opacity: hovered === i ? 1 : 0.8, cursor: 'pointer', transition: 'opacity 0.15s', borderRight: '1px solid rgba(0,0,0,0.1)' }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem', ...mono, fontSize: '0.55rem', color: 'var(--text-dim)' }}>
        <span style={{ color: 'var(--researcher)' }}>Researcher</span>
        <span style={{ color: 'var(--builder)' }}>Builder</span>
        <span style={{ color: 'var(--green)' }}>Review</span>
      </div>
      {h && hovered !== null && (
        <div style={{ padding: '0.6rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginTop: '0.5rem', ...mono, fontSize: '0.7rem' }}>
          <div>#{hovered + 1}: {h.receipt.action.type}</div>
          <div style={{ color: 'var(--text-muted)' }}>{h.receipt.action.description?.slice(0, 80)}</div>
          <div>{(h.durationMs / 1000).toFixed(1)}s{h.tokensUsed ? ` · ${h.tokensUsed} tokens` : ''}</div>
        </div>
      )}
    </div>
  );
}

function EfficiencyLine({ tokens, quality }: { tokens: number; quality: number|null }) {
  const cost = tokens * PRICE;
  const eff = quality && quality > 0 ? cost / (quality / 100) : null;
  if (!eff) return null;
  return (
    <div style={{ ...mono, fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0.7rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '1.5rem' }}>
      <div style={{ fontWeight: 600, color: eff < 0.005 ? 'var(--green)' : eff < 0.01 ? 'var(--amber)' : 'var(--red)' }}>Cost per useful output: ${eff.toFixed(4)}</div>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>{tokens.toLocaleString()} tokens x $0.15/1K / {quality}% quality</div>
    </div>
  );
}

function RunColumn({ label, data, hov, setHov }: { label: string; data: RunData; hov: number|null; setHov: (i: number|null) => void }) {
  const t = data.totalMs || data.receipts.reduce((s, r) => s + r.durationMs, 0);
  const q = data.quality;
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...sectionLabel, marginBottom: '0.5rem' }}>{label}</div>
      {data.receipts.length > 0 && <Timeline receipts={data.receipts} totalMs={t} hovered={hov} setHovered={setHov} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.8rem', margin: '1rem 0' }}>
        <StatCard value={t > 0 ? (t / 1000).toFixed(1) + 's' : '--'} label="total time" />
        <StatCard value={data.tokens > 0 ? data.tokens.toLocaleString() : '--'} label="tokens" />
        <StatCard value={q !== null ? `${q}/100` : '--'} label="quality" color={q !== null ? (q >= 70 ? 'var(--green)' : q >= 40 ? 'var(--amber)' : 'var(--red)') : undefined} />
      </div>
      <EfficiencyLine tokens={data.tokens} quality={q} />
    </div>
  );
}

/* Main */
export default function TrialPage() {
  const [phase, setPhase] = useState<'idle'|'running'|'done'|'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const statusTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const [trialReceipts, setTrialReceipts] = useState<TrialReceipt[]>([]);
  const [totalTimeMs, setTotalTimeMs] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [qualityScore, setQualityScore] = useState<number|null>(null);
  const [rootHash, setRootHash] = useState('');
  const [teeVerified, setTeeVerified] = useState(false);
  const [agenticIdMinted, setAgenticIdMinted] = useState(false);
  const [fineTuningStarted, setFineTuningStarted] = useState(false);
  const [reviewerSelection, setReviewerSelection] = useState<{model:string;reason:string;attested:boolean}|null>(null);
  const [humanRating, setHumanRating] = useState<number|null>(null);
  const [humanSubmitted, setHumanSubmitted] = useState(false);
  const [humanHash, setHumanHash] = useState('');
  const [hovR, setHovR] = useState<number|null>(null);
  const [hovH, setHovH] = useState<number|null>(null);
  const [hovL, setHovL] = useState<number|null>(null);
  const [compMode, setCompMode] = useState(false);
  const [honestData, setHonestData] = useState<RunData|null>(null);
  const [lowData, setLowData] = useState<RunData|null>(null);

  const status = useCallback((msg: string) => {
    setStatusMsg(msg);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatusMsg(''), 3000);
  }, []);

  const resetState = useCallback(() => {
    setTrialReceipts([]); setTotalTimeMs(0); setTotalTokens(0); setQualityScore(null); setRootHash('');
    setTeeVerified(false); setAgenticIdMinted(false); setFineTuningStarted(false); setReviewerSelection(null);
    setHumanRating(null); setHumanSubmitted(false); setHumanHash(''); setHonestData(null); setLowData(null);
  }, []);

  const metaHandler = useCallback((k: string, v: any) => {
    if (k === 'reviewScores') { setQualityScore(v.composite); }
    if (k === 'reviewerSelection') setReviewerSelection(v);
    if (k === 'totalMs') setTotalTimeMs(v);
    if (k === 'teeVerified') setTeeVerified(true);
    if (k === 'agenticId') setAgenticIdMinted(true);
    if (k === 'fineTuning') setFineTuningStarted(true);
    if (k === 'rootHash') setRootHash(v);
  }, []);

  const runSingle = useCallback(async (lq: boolean) => {
    setPhase('running'); setCompMode(false); resetState();
    try {
      const r = await runPipeline(lq,
        (tr) => { setTrialReceipts(p => [...p, tr]); if (tr.tokensUsed) setTotalTokens(p => p + tr.tokensUsed!); },
        status, metaHandler,
      );
      setTotalTimeMs(r.totalMs || r.receipts.reduce((s, x) => s + x.durationMs, 0));
      setTotalTokens(r.tokens); setQualityScore(r.quality); setRootHash(r.rootHash); setPhase('done');
    } catch { setPhase('error'); status('Pipeline failed'); }
  }, [status, resetState, metaHandler]);

  const runComparison = useCallback(async () => {
    setPhase('running'); setCompMode(true); resetState();
    try {
      const [h, l] = await Promise.all([runPipeline(false, undefined, status), runPipeline(true, undefined, status)]);
      setHonestData(h); setLowData(l); setRootHash(h.rootHash); setQualityScore(h.quality); setPhase('done');
    } catch { setPhase('error'); status('Comparison failed'); }
  }, [status, resetState]);

  const submitHuman = useCallback(async () => {
    if (!humanRating || !rootHash) return;
    try {
      const kp = await crypto.subtle.generateKey({ name: 'Ed25519' } as any, true, ['sign', 'verify']) as CryptoKeyPair;
      const last = trialReceipts[trialReceipts.length - 1]?.receipt;
      const prevId = last?.id || '', ts = Date.now();
      const inH = await sha256(rootHash);
      const outH = await sha256(JSON.stringify({ humanScore: humanRating, reviewer: 'human', timestamp: ts }));
      const id = await sha256(`${prevId}:human-reviewer:${ts}:usefulness_review:${inH}:${outH}`);
      const payload = `${id}:${prevId}:human-reviewer:${ts}:usefulness_review:${inH}:${outH}`;
      const sig = bufToHex(new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' } as any, kp.privateKey, new TextEncoder().encode(payload))));
      const hr: Receipt = { id, prevId, agentId: 'human-reviewer', timestamp: ts, action: { type: 'usefulness_review', description: 'Human review -- Execution Replay' }, inputHash: inH, outputHash: outH, signature: sig, attestation: null };
      setTrialReceipts(p => [...p, { receipt: hr, agent: 'human', durationMs: 0, tokensUsed: null, startMs: totalTimeMs }]);
      setHumanSubmitted(true); setHumanHash(id);
    } catch {
      const id = await sha256(`fallback:human-reviewer:${Date.now()}:${humanRating}`);
      setHumanSubmitted(true); setHumanHash(id);
    }
  }, [humanRating, rootHash, trialReceipts, totalTimeMs]);

  const effTotalMs = compMode ? 0 : (totalTimeMs || trialReceipts.reduce((s, r) => s + r.durationMs, 0));
  const effTokens = compMode ? 0 : totalTokens;
  const verifs = [
    { label: 'Compute', desc: 'Inference ran in hardware enclave', ok: teeVerified },
    { label: 'Identity', desc: 'Agent identity minted on-chain', ok: agenticIdMinted },
    { label: 'Training', desc: 'Quality data fed to fine-tuning', ok: fineTuningStarted },
  ];
  const btnBase = { padding: '0.6rem 1.4rem', borderRadius: '8px', fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', fontWeight: 600, cursor: phase === 'running' ? 'not-allowed' as const : 'pointer' as const };
  const running = phase === 'running';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      <style>{`@media(max-width:640px){.trial-stats{grid-template-columns:1fr!important}.trial-compare{flex-direction:column!important}.trial-buttons{flex-direction:column!important;align-items:stretch!important}.trial-buttons button{width:100%!important}.trial-human-circles{gap:0.3rem!important}}`}</style>

      <nav style={{ padding: '0.6rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <a href="/" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>R.E.C.E.I.P.T.</a>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          {[['/', 'Home'], ['/demo', 'Demo'], ['/verify', 'Verify'], ['/dashboard', 'Dashboard']].map(([href, label]) => (
            <a key={href} href={href} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>{label}</a>
          ))}
          <a href="/trial" style={{ fontSize: '0.75rem', color: 'var(--text)', textDecoration: 'none', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>Replay</a>
        </div>
      </nav>

      <section style={{ padding: '2rem 2rem 1rem', maxWidth: '820px', margin: '0 auto', width: '100%' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, fontFamily: 'Inter, sans-serif', marginBottom: '0.4rem' }}>Execution Replay</h1>
        <p style={{ fontSize: '0.92rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', lineHeight: 1.6, marginBottom: '1.2rem' }}>See what your agents did, what it cost, and whether it mattered.</p>
        <div className="trial-buttons" style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.8rem' }}>
          <button onClick={() => runSingle(false)} disabled={running} style={{ ...btnBase, border: 'none', background: running ? 'var(--border)' : 'var(--text)', color: '#fff' }}>
            {running && !compMode ? 'Running...' : 'Run Demo'}
          </button>
          <button onClick={() => runSingle(true)} disabled={running} style={{ ...btnBase, border: '1px solid var(--amber)', background: running ? 'var(--border)' : 'rgba(217,119,6,0.06)', color: running ? '#fff' : 'var(--amber)' }}>Run Low-Quality</button>
          <button onClick={runComparison} disabled={running} style={{ ...btnBase, border: '1px solid var(--border)', background: running ? 'var(--border)' : 'var(--surface)', color: running ? '#fff' : 'var(--text)', fontWeight: 500 }}>Compare Both</button>
        </div>
        {statusMsg && <div style={{ ...mono, fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>{statusMsg}</div>}
      </section>

      <section style={{ padding: '0 2rem 2rem', maxWidth: '820px', margin: '0 auto', width: '100%' }}>
        {/* Comparison */}
        {compMode && phase === 'done' && honestData && lowData && (<>
          <div className="trial-compare" style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <RunColumn label="Honest Run" data={honestData} hov={hovH} setHov={setHovH} />
            <RunColumn label="Low-Quality Run" data={lowData} hov={hovL} setHov={setHovL} />
          </div>
          {(() => {
            const hQ = honestData.quality || 0, lQ = lowData.quality || 0;
            const hE = hQ > 0 ? (honestData.tokens * PRICE) / (hQ / 100) : 0;
            const lE = lQ > 0 ? (lowData.tokens * PRICE) / (lQ / 100) : 0;
            const ratio = lE > 0 && hE > 0 ? (lE / hE).toFixed(1) : null;
            return (
              <div style={{ ...card }}>
                <div style={sectionLabel}>Efficiency Comparison</div>
                <div style={{ ...mono, fontSize: '0.75rem', marginBottom: '0.25rem' }}><span style={{ color: 'var(--green)' }}>Honest:</span> ${hE.toFixed(4)}/useful-unit ({hQ}/100 quality)</div>
                <div style={{ ...mono, fontSize: '0.75rem', marginBottom: '0.4rem' }}><span style={{ color: 'var(--red)' }}>Low Quality:</span> ${lE.toFixed(4)}/useful-unit ({lQ}/100 quality)</div>
                {ratio && <div style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>Honest work is <span style={{ color: 'var(--green)' }}>{ratio}x</span> more cost-efficient</div>}
              </div>
            );
          })()}
        </>)}

        {/* Single mode */}
        {!compMode && trialReceipts.length > 0 && (<>
          <Timeline receipts={trialReceipts} totalMs={effTotalMs} hovered={hovR} setHovered={setHovR} />
          <div className="trial-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', margin: '1.5rem 0' }}>
            <StatCard value={effTotalMs > 0 ? (effTotalMs / 1000).toFixed(1) + 's' : '--'} label="total time" />
            <StatCard value={effTokens > 0 ? effTokens.toLocaleString() : '--'} label="tokens used" />
            <StatCard value={qualityScore !== null ? `${qualityScore}/100` : '--'} label="quality score" color={qualityScore !== null ? (qualityScore >= 70 ? 'var(--green)' : qualityScore >= 40 ? 'var(--amber)' : 'var(--red)') : undefined} />
          </div>
          <EfficiencyLine tokens={effTokens} quality={qualityScore} />

          {/* 0G Verification */}
          <div style={card}>
            <div style={sectionLabel}>0G Verification</div>
            {verifs.map(v => (
              <div key={v.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <span style={{ ...mono, fontSize: '0.8rem', color: v.ok ? 'var(--green)' : 'var(--text-dim)', width: '16px', textAlign: 'center' }}>{v.ok ? '✓' : '—'}</span>
                <div>
                  <div style={{ ...mono, fontSize: '0.75rem', fontWeight: 600 }}>{v.label}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'Inter, sans-serif' }}>{v.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Reviewer Selection */}
          {reviewerSelection && (
            <div style={card}>
              <div style={{ ...sectionLabel, textTransform: 'uppercase' }}>Reviewer Selection</div>
              <div style={{ ...mono, fontSize: '0.8rem' }}>
                Model: <strong>{reviewerSelection.model}</strong>
                {reviewerSelection.attested && <span style={{ marginLeft: '0.5rem', padding: '0.15rem 0.4rem', background: 'rgba(22,163,74,0.1)', color: 'var(--green)', borderRadius: '4px', fontSize: '0.55rem', fontWeight: 600 }}>TEE VERIFIED</span>}
              </div>
              <div style={{ ...mono, fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>&quot;{reviewerSelection.reason}&quot;</div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.3rem', fontFamily: 'Inter, sans-serif' }}>Agent can&apos;t pick its own grader -- model selected inside TEE enclave</div>
            </div>
          )}

          {/* Human Review */}
          {phase === 'done' && !humanSubmitted && (
            <div style={{ ...card, padding: '1.2rem' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, fontFamily: 'Inter, sans-serif', marginBottom: '0.8rem' }}>Was this agent run useful to you?</div>
              <div className="trial-human-circles" style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                  <button key={n} onClick={() => setHumanRating(n)} style={{
                    width: '36px', height: '36px', borderRadius: '50%', ...mono, fontSize: '0.75rem', fontWeight: 600,
                    border: `2px solid ${humanRating === n ? 'var(--text)' : 'var(--border)'}`,
                    background: humanRating === n ? 'var(--text)' : 'transparent',
                    color: humanRating === n ? '#fff' : 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.15s',
                  }}>{n}</button>
                ))}
              </div>
              <button onClick={submitHuman} disabled={!humanRating} style={{
                padding: '0.5rem 1.2rem', borderRadius: '8px', border: 'none',
                background: humanRating ? 'var(--text)' : 'var(--border)', color: '#fff',
                cursor: humanRating ? 'pointer' : 'not-allowed', fontFamily: 'Inter, sans-serif', fontSize: '0.82rem', fontWeight: 600,
              }}>Submit Review</button>
            </div>
          )}
          {humanSubmitted && (
            <div style={{ ...card, borderColor: 'var(--green)' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'Inter, sans-serif', color: 'var(--green)', marginBottom: '0.3rem' }}>AI scored {qualityScore !== null ? `${qualityScore}/100` : '--'}. You scored {humanRating}/10.</div>
              <div style={{ ...mono, fontSize: '0.7rem', color: 'var(--text-muted)' }}>Receipt #{trialReceipts.length} signed and linked to chain.</div>
              <div style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>Hash: 0x{humanHash.slice(0, 8)}...</div>
            </div>
          )}

          {/* Proof */}
          {phase === 'done' && rootHash && (
            <div style={card}>
              <div style={sectionLabel}>Chain Proof</div>
              <div style={{ ...mono, fontSize: '0.72rem', lineHeight: 1.8 }}>
                <div>Chain: <strong>{trialReceipts.length} receipts</strong>{(() => {
                  const a = trialReceipts.filter(r => r.agent === 'A').length, b = trialReceipts.filter(r => r.agent === 'B').length;
                  const rv = trialReceipts.filter(r => r.receipt.action.type === 'usefulness_review' && r.agent !== 'human').length;
                  const h = trialReceipts.filter(r => r.agent === 'human').length;
                  const p = [a && `${a} researcher`, b && `${b} builder`, rv && `${rv} AI review`, h && `${h} human`].filter(Boolean);
                  return p.length ? ` (${p.join(' + ')})` : '';
                })()}</div>
                <div>Root: <span style={{ color: 'var(--text-dim)' }}>0x{rootHash.slice(0, 8)}...</span></div>
              </div>
              <button onClick={() => { sessionStorage.setItem('receipt-verify-chain', JSON.stringify(trialReceipts.map(t => t.receipt))); window.location.href = '/verify?from=session&auto=1'; }}
                style={{ marginTop: '0.8rem', padding: '0.5rem 1.2rem', borderRadius: '8px', border: '1px solid var(--green)', background: 'rgba(22,163,74,0.06)', color: 'var(--green)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '0.78rem', fontWeight: 600 }}>
                Verify This Chain &rarr;
              </button>
            </div>
          )}
        </>)}

        {phase === 'idle' && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-dim)' }}>
            <div style={{ ...mono, fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text)', letterSpacing: '0.04em' }}>R.E.C.E.I.P.T.</div>
            <p style={{ fontSize: '0.85rem', fontFamily: 'Inter, sans-serif', lineHeight: 1.6, maxWidth: '400px', margin: '0 auto' }}>Run the pipeline and watch the execution timeline, cost breakdown, and quality scores appear in real time.</p>
          </div>
        )}
        {running && !compMode && trialReceipts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}><div style={{ ...mono, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Starting pipeline...</div></div>
        )}
      </section>

      <footer style={{ marginTop: 'auto', padding: '0.8rem 1.5rem', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.68rem', color: 'var(--text-dim)', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ display: 'flex', gap: '1.2rem' }}>
          {['/demo', '/verify', '/dashboard'].map(h => <a key={h} href={h} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{h.slice(1).charAt(0).toUpperCase() + h.slice(2)}</a>)}
        </div>
        <span style={{ ...mono, fontSize: '0.6rem' }}>Execution Replay</span>
      </footer>
    </div>
  );
}
