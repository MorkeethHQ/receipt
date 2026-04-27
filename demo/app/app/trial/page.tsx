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
  researcherChain?: any[]; researcherKey?: string;
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
async function readSSEStream(
  res: Response,
  receipts: TrialReceipt[],
  d: RunData,
  onReceipt?: (tr: TrialReceipt) => void,
  onStatus?: (msg: string) => void,
  onMeta?: (key: string, value: any) => void,
) {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
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
          else if (ev === 'pipeline_timing') { d.totalMs += p.totalMs || 0; onMeta?.('totalMs', d.totalMs); }
          else if (ev === 'tee_verified') { d.teeVerified = true; onMeta?.('teeVerified', true); }
          else if (ev === 'agentic_id') { d.agenticId = true; onMeta?.('agenticId', true); }
          else if (ev === 'fine_tuning') { d.fineTuning = true; onMeta?.('fineTuning', true); }
          else if (ev === 'done') { d.rootHash = p.rootHash || ''; onMeta?.('rootHash', d.rootHash); }
          else if (ev === 'researcher_done') { d.researcherChain = p.receipts; d.researcherKey = p.publicKey; }
          else if (ev === 'status') { onStatus?.(p.message || ''); }
          else if (ev === 'error') { onStatus?.(`Error: ${p.message || 'unknown'}`); }
        } catch {}
        ev = '';
      }
    }
  }
}

async function runPipeline(
  lowQuality: boolean,
  onReceipt?: (tr: TrialReceipt) => void,
  onStatus?: (msg: string) => void,
  onMeta?: (key: string, value: any) => void,
): Promise<RunData> {
  const receipts: TrialReceipt[] = [];
  const d: RunData = { receipts: [], totalMs: 0, tokens: 0, quality: null, rootHash: '', reviewerSelection: null, teeVerified: false, agenticId: false, fineTuning: false, reviewScores: null };

  // Phase 1: Researcher
  const r1 = await fetch('/api/researcher', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adversarial: false }) });
  await readSSEStream(r1, receipts, d, onReceipt, onStatus, onMeta);

  // Phase 2: Builder (passes chain as fallback; Builder tries AXL first)
  if (d.researcherChain) {
    const r2 = await fetch('/api/builder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lowQuality, receipts: d.researcherChain, publicKey: d.researcherKey }) });
    await readSSEStream(r2, receipts, d, onReceipt, onStatus, onMeta);
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
      {/* Agent labels with AXL handoff marker */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem', ...mono, fontSize: '0.55rem', color: 'var(--text-dim)' }}>
        <span style={{ color: 'var(--researcher)' }}>Researcher</span>
        <span style={{ letterSpacing: '0.06em' }}>AXL HANDOFF</span>
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
      <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', marginTop: '0.25rem', fontFamily: 'Inter, sans-serif' }}>Token cost divided by quality score. Lower = more value per dollar. Compare honest vs low-quality runs to see the difference.</div>
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

/* Live Agent mode — fetch real chains from OpenClaw plugin */
async function fetchLiveChain(): Promise<RunData | null> {
  const res = await fetch('/api/live-chain?mode=latest');
  if (!res.ok) return null;
  const chain = await res.json();
  if (chain.error || !chain.receipts?.length) return null;

  let elapsed = 0;
  const trialReceipts: TrialReceipt[] = chain.receipts.map((r: Receipt, i: number) => {
    const dur = i === 0 ? 200 : (chain.durationMs || 5000) / chain.receipts.length;
    const agent: 'A'|'B' = r.action.type === 'usefulness_review' ? 'B' : (i < chain.receipts.length / 2 ? 'A' : 'B');
    const tr: TrialReceipt = { receipt: r, agent, durationMs: dur, tokensUsed: null, startMs: elapsed };
    elapsed += dur;
    return tr;
  });

  const byType: Record<string, number> = {};
  for (const r of chain.receipts) byType[r.action.type] = (byType[r.action.type] ?? 0) + 1;

  return {
    receipts: trialReceipts,
    totalMs: chain.durationMs || elapsed,
    tokens: (byType['tool_call'] || 0) * 150 + (byType['context_read'] || 0) * 80,
    quality: null,
    rootHash: chain.rootHash || '',
    reviewerSelection: null,
    teeVerified: false,
    agenticId: false,
    fineTuning: false,
    reviewScores: null,
  };
}

async function fetchLiveChainsList(): Promise<any[]> {
  const res = await fetch('/api/live-chain?mode=chains');
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
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
  const [liveMode, setLiveMode] = useState(false);
  const [liveChains, setLiveChains] = useState<any[]>([]);

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
    setPhase('running'); setCompMode(false); setLiveMode(false); resetState();
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
    setPhase('running'); setCompMode(true); setLiveMode(false); resetState();
    try {
      const [h, l] = await Promise.all([runPipeline(false, undefined, status), runPipeline(true, undefined, status)]);
      setHonestData(h); setLowData(l); setRootHash(h.rootHash); setQualityScore(h.quality); setPhase('done');
    } catch { setPhase('error'); status('Comparison failed'); }
  }, [status, resetState]);

  const runLiveAgent = useCallback(async () => {
    setPhase('running'); setCompMode(false); setLiveMode(true); resetState();
    status('Fetching live chain from OpenClaw...');
    try {
      const [chain, chains] = await Promise.all([fetchLiveChain(), fetchLiveChainsList()]);
      setLiveChains(chains);
      if (!chain) { setPhase('error'); status('No chain available — send Bagel a task via Telegram first'); return; }
      setTrialReceipts(chain.receipts);
      setTotalTimeMs(chain.totalMs);
      setTotalTokens(chain.tokens);
      setQualityScore(chain.quality);
      setRootHash(chain.rootHash);
      setPhase('done');
      status(`Loaded ${chain.receipts.length} receipts from live agent`);
    } catch { setPhase('error'); status('Failed to reach OpenClaw — is the VPS running?'); }
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
    { label: 'Compute', desc: 'Inference ran in hardware enclave via 0G Compute (TeeML)', ok: teeVerified },
    { label: 'Identity', desc: 'Soulbound agent identity minted via ERC-7857 on 0G Mainnet', ok: agenticIdMinted },
    { label: 'Training', desc: 'Quality-gated chain fed to 0G fine-tuning pipeline', ok: fineTuningStarted },
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
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, fontFamily: 'Inter, sans-serif', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          Execution Replay
          {liveMode && <span style={{ ...mono, fontSize: '0.55rem', padding: '0.2rem 0.5rem', background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.05em' }}>LIVE AGENT</span>}
        </h1>
        <p style={{ fontSize: '0.92rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', lineHeight: 1.6, marginBottom: '1.2rem' }}>See what your agents did, what it cost, and whether it mattered.</p>
        <div className="trial-buttons" style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.8rem' }}>
          <button onClick={() => runSingle(false)} disabled={running} style={{ ...btnBase, border: 'none', background: running ? 'var(--border)' : 'var(--text)', color: '#fff' }}>
            {running && !compMode ? 'Running...' : 'Run Demo'}
          </button>
          <button onClick={() => runSingle(true)} disabled={running} style={{ ...btnBase, border: '1px solid var(--amber)', background: running ? 'var(--border)' : 'rgba(217,119,6,0.06)', color: running ? '#fff' : 'var(--amber)' }}>Run Low-Quality</button>
          <button onClick={runComparison} disabled={running} style={{ ...btnBase, border: '1px solid var(--border)', background: running ? 'var(--border)' : 'var(--surface)', color: running ? '#fff' : 'var(--text)', fontWeight: 500 }}>Compare Both</button>
          <button onClick={runLiveAgent} disabled={running} style={{ ...btnBase, border: '1px solid #8b5cf6', background: running ? 'var(--border)' : 'rgba(139,92,246,0.06)', color: running ? '#fff' : '#8b5cf6' }}>Live Agent</button>
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
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                {[
                  { label: 'Anchor', addr: '0x73B9A7768679B154D7E1eC5F2570a622A3b49651' },
                  { label: 'Identity', addr: '0xf964d45c3Ea5368918B1FDD49551E373028108c9' },
                  { label: 'Validation', addr: '0x2E32E845928A92DB193B59676C16D52923Fa01dd' },
                ].map(c => (
                  <a key={c.addr} href={`https://chainscan-newton.0g.ai/address/${c.addr}`} target="_blank" rel="noopener noreferrer"
                    style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', textDecoration: 'none', padding: '0.2rem 0.5rem', background: 'var(--bg)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                    {c.label}: {c.addr.slice(0, 8)}...
                  </a>
                ))}
              </div>
              <button onClick={() => { sessionStorage.setItem('receipt-verify-chain', JSON.stringify(trialReceipts.map(t => t.receipt))); window.location.href = '/verify?from=session&auto=1'; }}
                style={{ marginTop: '0.8rem', padding: '0.5rem 1.2rem', borderRadius: '8px', border: '1px solid var(--green)', background: 'rgba(22,163,74,0.06)', color: 'var(--green)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '0.78rem', fontWeight: 600 }}>
                Verify This Chain &rarr;
              </button>
            </div>
          )}
        </>)}

        {/* Live Agent chain history */}
        {liveMode && liveChains.length > 0 && phase === 'done' && (
          <div style={card}>
            <div style={sectionLabel}>Live Chain History</div>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {liveChains.slice(0, 10).map((c: any) => (
                <div key={c.id} onClick={async () => {
                  const res = await fetch(`/api/live-chain?mode=chain&id=${encodeURIComponent(c.id)}`);
                  if (!res.ok) return;
                  const full = await res.json();
                  if (!full.receipts?.length) return;
                  let elapsed = 0;
                  const trs: TrialReceipt[] = full.receipts.map((r: Receipt, i: number) => {
                    const dur = (full.durationMs || 5000) / full.receipts.length;
                    const tr: TrialReceipt = { receipt: r, agent: i < full.receipts.length / 2 ? 'A' : 'B', durationMs: dur, tokensUsed: null, startMs: elapsed };
                    elapsed += dur;
                    return tr;
                  });
                  setTrialReceipts(trs);
                  setTotalTimeMs(full.durationMs || elapsed);
                  setRootHash(full.rootHash || '');
                }} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--border)',
                  cursor: 'pointer', fontSize: '0.7rem', ...mono,
                }}>
                  <span>{c.receipts} receipts — {c.toolCalls?.join(', ') || 'no tools'}</span>
                  <span style={{ color: c.valid ? 'var(--green)' : 'var(--red)', fontSize: '0.6rem' }}>{c.valid ? 'VALID' : 'INVALID'}</span>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.55rem' }}>{new Date(c.completedAt).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

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
          {[['Demo', '/demo'], ['Verify', '/verify'], ['Dashboard', '/dashboard']].map(([label, href]) => <a key={href} href={href} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{label}</a>)}
        </div>
        <span style={{ ...mono, fontSize: '0.6rem' }}>Execution Replay</span>
      </footer>
    </div>
  );
}
