'use client';

import { useState, useCallback } from 'react';

const mono = { fontFamily: "'IBM Plex Mono', 'Courier New', monospace" } as const;
const inter = { fontFamily: 'Inter, sans-serif' } as const;

interface ModelAccuracy {
  overall: number;
  byCategory: Record<string, number>;
  preCritique: number;
  postCritique: number;
}

interface CritiqueEffect {
  changed: number;
  improved: number;
  worsened: number;
  avgDelta: number;
}

interface Disagreement {
  testCaseId: number;
  category: string;
  task: string;
  workProductPreview: string;
  scores: Array<{ model: string; score: number; classification: string; revised: number | null; revisedClass: string | null }>;
  analysis: string;
}

interface EvalReport {
  seed: number;
  timestamp: number;
  testCaseCount: number;
  modelsUsed: string[];
  accuracy: Record<string, ModelAccuracy>;
  agreement: { rate: number; disagreements: number };
  falsePositives: Record<string, number>;
  falseNegatives: Record<string, number>;
  critiqueEffect: Record<string, CritiqueEffect>;
  consensusAccuracy: number;
  interestingDisagreements: Disagreement[];
}

function Nav() {
  return (
    <nav style={{ padding: '0.6rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <a href="/" style={{ ...mono, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>R.E.C.E.I.P.T.</a>
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
        <a href="/" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', ...inter }}>Home</a>
        <a href="/team" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', ...inter }}>Dashboard</a>
        <a href="/demo" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', ...inter }}>Demo</a>
        <a href="/verify" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', ...inter }}>Verify</a>
        <a href="/eval" style={{ fontSize: '0.75rem', color: 'var(--text)', textDecoration: 'none', ...inter, fontWeight: 600 }}>Eval</a>
        <a href="https://github.com/MorkeethHQ/receipt" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', ...inter }}>GitHub</a>
      </div>
    </nav>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ ...inter, fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.8rem', color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ ...inter, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.75, marginBottom: '0.8rem' }}>{children}</p>;
}

function ScoreColor({ value }: { value: number }) {
  const color = value >= 70 ? 'var(--green)' : value >= 40 ? 'var(--amber)' : 'var(--red)';
  return <span style={{ ...mono, fontWeight: 700, color }}>{value}%</span>;
}

export default function EvalPage() {
  const [report, setReport] = useState<EvalReport | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ index: 0, total: 0, task: '' });
  const [error, setError] = useState('');

  // Try to load cached report on mount
  const loadCached = useCallback(() => {
    try {
      const cached = localStorage.getItem('receipt_eval_report');
      if (cached) setReport(JSON.parse(cached));
    } catch {}
  }, []);

  // Run eval
  const runEval = useCallback(async (maxCases: number = 60) => {
    setRunning(true);
    setError('');
    setReport(null);

    try {
      const res = await fetch('/api/eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: 42, maxCases }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Eval failed');
        setRunning(false);
        return;
      }

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        let ev = '';
        for (const ln of lines) {
          if (ln.startsWith('event: ')) ev = ln.slice(7);
          else if (ln.startsWith('data: ') && ev) {
            try {
              const data = JSON.parse(ln.slice(6));
              if (ev === 'progress') setProgress({ index: data.index, total: data.total, task: data.task });
              if (ev === 'report') {
                setReport(data);
                try { localStorage.setItem('receipt_eval_report', JSON.stringify(data)); } catch {}
              }
            } catch {}
            ev = '';
          }
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to run eval');
    }

    setRunning(false);
  }, []);

  // Load cached on first render
  useState(() => { loadCached(); });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @media (max-width: 640px) {
          .eval-content { padding: 1.5rem 1rem !important; }
          .eval-table { font-size: 0.65rem !important; }
          .eval-table th, .eval-table td { padding: 0.3rem 0.4rem !important; }
        }
      `}</style>
      <Nav />

      <div className="eval-content" style={{ maxWidth: '780px', margin: '0 auto', width: '100%', padding: '2rem 2rem 3rem' }}>
        <h1 style={{ ...inter, fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.3rem' }}>
          Can We Trust AI Quality Scores?
        </h1>
        <p style={{ ...inter, fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          A multi-model evaluation of RECEIPT&apos;s usefulness assessment with Constitutional AI self-critique.
        </p>

        {/* Run controls */}
        <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => runEval(12)} disabled={running} style={{
            padding: '0.5rem 1.2rem', borderRadius: '8px', border: 'none',
            background: running ? 'var(--border)' : 'var(--text)', color: '#fff',
            cursor: running ? 'not-allowed' : 'pointer', ...inter, fontSize: '0.82rem', fontWeight: 600,
          }}>
            {running ? `Running... (${progress.index}/${progress.total})` : 'Run Quick Eval (12 cases)'}
          </button>
          <button onClick={() => runEval(60)} disabled={running} style={{
            padding: '0.5rem 1.2rem', borderRadius: '8px', border: '1px solid var(--border)',
            background: running ? 'var(--border)' : 'var(--surface)', color: running ? '#fff' : 'var(--text)',
            cursor: running ? 'not-allowed' : 'pointer', ...inter, fontSize: '0.82rem', fontWeight: 500,
          }}>
            Full Eval (60 cases)
          </button>
          {report && !running && (
            <span style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-dim)' }}>
              Last run: {new Date(report.timestamp).toLocaleString()} (seed: {report.seed})
            </span>
          )}
        </div>

        {running && (
          <div style={{ padding: '1.2rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '1.5rem' }}>
            <style>{`
              @keyframes evalSpin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
              @keyframes evalPulse {
                0%, 100% { opacity: 0.4; }
                50% { opacity: 1; }
              }
              @keyframes evalProgress {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
              }
            `}</style>
            {/* Header with spinner */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.8rem' }}>
              <div style={{
                width: '18px', height: '18px', borderRadius: '50%',
                border: '2px solid var(--border)', borderTopColor: 'var(--text)',
                animation: 'evalSpin 0.8s linear infinite',
              }} />
              <span style={{ ...inter, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
                Running evaluation across {progress.total || 3} models...
              </span>
            </div>
            {/* Subtext */}
            <div style={{ ...inter, fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
              Each test case is scored, then self-critiqued against 5 Constitutional AI principles. This takes ~30 seconds.
            </div>
            {/* Progress bar */}
            {progress.total > 0 && (
              <div style={{ marginBottom: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ ...mono, fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    Case {progress.index} of {progress.total}
                  </span>
                  <span style={{ ...mono, fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                    {Math.round((progress.index / progress.total) * 100)}%
                  </span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${(progress.index / progress.total) * 100}%`,
                    height: '100%', borderRadius: '3px',
                    background: 'var(--text)',
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>
            )}
            {/* Indeterminate shimmer when no progress yet */}
            {progress.total === 0 && (
              <div style={{ width: '100%', height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.8rem' }}>
                <div style={{
                  width: '100%', height: '100%', borderRadius: '3px',
                  background: 'linear-gradient(90deg, var(--border) 0%, var(--text-muted) 50%, var(--border) 100%)',
                  backgroundSize: '200% 100%',
                  animation: 'evalProgress 1.8s ease-in-out infinite',
                }} />
              </div>
            )}
            {/* Current task */}
            {progress.task && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ ...mono, fontSize: '0.62rem', color: 'var(--text-dim)', animation: 'evalPulse 1.5s ease-in-out infinite' }}>
                  &#9679;
                </span>
                <span style={{ ...mono, fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                  {progress.task}
                </span>
              </div>
            )}
          </div>
        )}

        {error && (
          <div style={{ padding: '0.8rem', background: 'rgba(220,38,38,0.06)', border: '1px solid var(--red)', borderRadius: '8px', ...mono, fontSize: '0.72rem', color: 'var(--red)', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {/* Report */}
        {report && (
          <>
            {/* Hero summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.8rem', marginBottom: '2rem' }}>
              {/* Consensus accuracy */}
              <div style={{ padding: '1.2rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', textAlign: 'center' }}>
                <div style={{ ...mono, fontSize: '2rem', fontWeight: 700, color: report.consensusAccuracy >= 70 ? 'var(--green)' : report.consensusAccuracy >= 50 ? 'var(--amber)' : 'var(--red)' }}>
                  {report.consensusAccuracy}%
                </div>
                <div style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.3rem' }}>
                  Consensus Accuracy
                </div>
                <div style={{ ...inter, fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                  {report.consensusAccuracy > Math.max(...report.modelsUsed.map(m => report.accuracy[m]?.overall ?? 0))
                    ? 'Beats every individual model'
                    : 'Multi-model majority vote'}
                </div>
              </div>

              {/* Critique improvement */}
              {(() => {
                const avgImprovement = report.modelsUsed.reduce((sum, m) => {
                  const a = report.accuracy[m];
                  return a ? sum + (a.postCritique - a.preCritique) : sum;
                }, 0) / report.modelsUsed.length;
                const totalChanged = Object.values(report.critiqueEffect).reduce((a, c) => a + c.changed, 0);
                return (
                  <div style={{ padding: '1.2rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ ...mono, fontSize: '2rem', fontWeight: 700, color: avgImprovement > 0 ? 'var(--green)' : 'var(--amber)' }}>
                      +{avgImprovement.toFixed(0)}pp
                    </div>
                    <div style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.3rem' }}>
                      Critique Effect
                    </div>
                    <div style={{ ...inter, fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                      {totalChanged} scores revised by self-critique
                    </div>
                  </div>
                );
              })()}

              {/* Agreement rate */}
              <div style={{ padding: '1.2rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', textAlign: 'center' }}>
                <div style={{ ...mono, fontSize: '2rem', fontWeight: 700, color: report.agreement.rate >= 80 ? 'var(--green)' : 'var(--amber)' }}>
                  {report.agreement.rate}%
                </div>
                <div style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.3rem' }}>
                  Model Agreement
                </div>
                <div style={{ ...inter, fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                  {report.agreement.disagreements} disagreement{report.agreement.disagreements !== 1 ? 's' : ''} across {report.testCaseCount} cases
                </div>
              </div>

              {/* False positives */}
              {(() => {
                const totalFP = Object.values(report.falsePositives).reduce((a, b) => a + b, 0);
                const totalFN = Object.values(report.falseNegatives).reduce((a, b) => a + b, 0);
                return (
                  <div style={{ padding: '1.2rem', background: 'var(--surface)', border: `1px solid ${totalFP > 0 ? 'var(--red)' : 'var(--border)'}`, borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ ...mono, fontSize: '2rem', fontWeight: 700, color: totalFP === 0 ? 'var(--green)' : 'var(--red)' }}>
                      {totalFP}
                    </div>
                    <div style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.3rem' }}>
                      False Positives
                    </div>
                    <div style={{ ...inter, fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                      {totalFP === 0 ? 'No bad work passed as good' : `${totalFP} bad outputs scored as useful`}
                      {totalFN > 0 ? ` · ${totalFN} FN` : ''}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Per-model visual comparison */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${report.modelsUsed.length}, 1fr)`, gap: '0.6rem', marginBottom: '2rem' }}>
              {report.modelsUsed.map(m => {
                const a = report.accuracy[m];
                if (!a) return null;
                const delta = a.postCritique - a.preCritique;
                return (
                  <div key={m} style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                    <div style={{ ...mono, fontSize: '0.7rem', fontWeight: 700, marginBottom: '0.6rem' }}>{m}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem', marginBottom: '0.5rem' }}>
                      <span style={{ ...mono, fontSize: '1.5rem', fontWeight: 700, color: a.overall >= 70 ? 'var(--green)' : a.overall >= 50 ? 'var(--amber)' : 'var(--red)' }}>{a.overall}%</span>
                      <span style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-dim)' }}>accuracy</span>
                    </div>
                    {/* Category bars */}
                    {['useful', 'mediocre', 'adversarial'].map(cat => {
                      const val = a.byCategory[cat] ?? 0;
                      return (
                        <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                          <span style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', width: '55px', textTransform: 'capitalize' }}>{cat}</span>
                          <div style={{ flex: 1, height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${val}%`, height: '100%', background: val >= 70 ? 'var(--green)' : val >= 50 ? 'var(--amber)' : 'var(--red)', borderRadius: '3px', transition: 'width 0.5s' }} />
                          </div>
                          <span style={{ ...mono, fontSize: '0.55rem', fontWeight: 600, width: '28px', textAlign: 'right' }}>{val}%</span>
                        </div>
                      );
                    })}
                    {/* Critique delta */}
                    <div style={{ ...mono, fontSize: '0.55rem', marginTop: '0.5rem', padding: '0.3rem 0.5rem', background: 'var(--bg)', borderRadius: '4px', display: 'inline-block' }}>
                      Pre: {a.preCritique}% → Post: {a.postCritique}%
                      <span style={{ color: delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--text-dim)', marginLeft: '0.3rem', fontWeight: 700 }}>
                        {delta > 0 ? '+' : ''}{delta}pp
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <Section title="1. Methodology">
              <P>
                We generated {report.testCaseCount} deterministic test cases (seed: {report.seed}) across three categories:
                20 &ldquo;useful&rdquo; (thorough research with citations and actionable insight),
                20 &ldquo;mediocre&rdquo; (correct but surface-level, no depth),
                and 20 &ldquo;adversarial&rdquo; (deliberately designed to fool quality scoring with verbose jargon and circular reasoning).
              </P>
              <P>
                Each test case was scored by {report.modelsUsed.join(', ')} using the same rubric: alignment (0-100),
                substance (0-100), quality (0-100), and a classification (useful/mediocre/useless).
                After initial scoring, each model applied a Constitutional AI-style self-critique against five principles
                targeting common failure modes (verbosity bias, jargon susceptibility, tone over substance).
              </P>
              <P>
                Ground truth was established by construction: useful cases contain specific quantitative findings and actionable recommendations;
                mediocre cases restate the prompt with generic advice; adversarial cases use impressive vocabulary to disguise circular reasoning.
              </P>
            </Section>

            <Section title="2. Results">
              <table className="eval-table" style={{ width: '100%', borderCollapse: 'collapse', ...mono, fontSize: '0.72rem', marginBottom: '1rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '0.4rem 0.6rem', color: 'var(--text-dim)' }}>Model</th>
                    <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: 'var(--text-dim)' }}>Accuracy</th>
                    <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: 'var(--text-dim)' }}>Useful</th>
                    <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: 'var(--text-dim)' }}>Mediocre</th>
                    <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: 'var(--text-dim)' }}>Adversarial</th>
                    <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: 'var(--text-dim)' }}>FP</th>
                    <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: 'var(--text-dim)' }}>FN</th>
                  </tr>
                </thead>
                <tbody>
                  {report.modelsUsed.map(m => {
                    const a = report.accuracy[m];
                    if (!a) return null;
                    return (
                      <tr key={m} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.5rem 0.6rem', fontWeight: 600 }}>{m}</td>
                        <td style={{ textAlign: 'center', padding: '0.5rem 0.6rem' }}><ScoreColor value={a.overall} /></td>
                        <td style={{ textAlign: 'center', padding: '0.5rem 0.6rem' }}><ScoreColor value={a.byCategory.useful ?? 0} /></td>
                        <td style={{ textAlign: 'center', padding: '0.5rem 0.6rem' }}><ScoreColor value={a.byCategory.mediocre ?? 0} /></td>
                        <td style={{ textAlign: 'center', padding: '0.5rem 0.6rem' }}><ScoreColor value={a.byCategory.adversarial ?? 0} /></td>
                        <td style={{ textAlign: 'center', padding: '0.5rem 0.6rem', color: 'var(--red)' }}>{report.falsePositives[m] ?? 0}</td>
                        <td style={{ textAlign: 'center', padding: '0.5rem 0.6rem', color: 'var(--amber)' }}>{report.falseNegatives[m] ?? 0}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                    <td style={{ padding: '0.5rem 0.6rem' }}>Consensus</td>
                    <td style={{ textAlign: 'center', padding: '0.5rem 0.6rem' }}><ScoreColor value={report.consensusAccuracy} /></td>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '0.5rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.65rem' }}>
                      {report.agreement.rate}% agreement rate &middot; {report.agreement.disagreements} disagreements
                    </td>
                  </tr>
                </tbody>
              </table>
              <P>
                {report.consensusAccuracy > Math.max(...report.modelsUsed.map(m => report.accuracy[m]?.overall ?? 0))
                  ? 'Multi-model consensus outperforms all individual models.'
                  : 'Individual model accuracy varies; consensus provides more stable results.'}
                {' '}Inter-model agreement rate: {report.agreement.rate}%.
              </P>
            </Section>

            <Section title="3. Self-Critique Effect">
              <P>
                After initial scoring, each model applied Constitutional AI-style self-critique against five principles
                designed to catch verbosity bias and jargon susceptibility.
              </P>
              <table className="eval-table" style={{ width: '100%', borderCollapse: 'collapse', ...mono, fontSize: '0.72rem', marginBottom: '1rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '0.4rem 0.6rem', color: 'var(--text-dim)' }}>Model</th>
                    <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: 'var(--text-dim)' }}>Pre-critique</th>
                    <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: 'var(--text-dim)' }}>Post-critique</th>
                    <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: 'var(--text-dim)' }}>Delta</th>
                    <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: 'var(--text-dim)' }}>Changed</th>
                    <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: 'var(--text-dim)' }}>Improved</th>
                    <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: 'var(--text-dim)' }}>Worsened</th>
                  </tr>
                </thead>
                <tbody>
                  {report.modelsUsed.map(m => {
                    const a = report.accuracy[m];
                    const c = report.critiqueEffect[m];
                    if (!a || !c) return null;
                    const delta = a.postCritique - a.preCritique;
                    return (
                      <tr key={m} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.5rem 0.6rem', fontWeight: 600 }}>{m}</td>
                        <td style={{ textAlign: 'center', padding: '0.5rem 0.6rem' }}><ScoreColor value={a.preCritique} /></td>
                        <td style={{ textAlign: 'center', padding: '0.5rem 0.6rem' }}><ScoreColor value={a.postCritique} /></td>
                        <td style={{ textAlign: 'center', padding: '0.5rem 0.6rem', color: delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                          {delta > 0 ? '+' : ''}{delta}pp
                        </td>
                        <td style={{ textAlign: 'center', padding: '0.5rem 0.6rem' }}>{c.changed}</td>
                        <td style={{ textAlign: 'center', padding: '0.5rem 0.6rem', color: 'var(--green)' }}>{c.improved}</td>
                        <td style={{ textAlign: 'center', padding: '0.5rem 0.6rem', color: 'var(--red)' }}>{c.worsened}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <P>
                Self-critique changes scores in {Object.values(report.critiqueEffect).reduce((a, c) => a + c.changed, 0)} of {report.testCaseCount * report.modelsUsed.length} evaluations.
                Average score delta when changed: {(Object.values(report.critiqueEffect).reduce((a, c) => a + c.avgDelta, 0) / report.modelsUsed.length).toFixed(1)} points.
              </P>
            </Section>

            <Section title="4. When Models Disagree">
              {report.interestingDisagreements.length === 0 ? (
                <P>No significant disagreements found (all spreads under 20 points). Models show strong alignment on this test set.</P>
              ) : (
                <>
                  <P>
                    These cases had the biggest score spreads (&gt;20 points) between models.
                    This is where multi-model consensus matters most - a single model would have gotten it wrong.
                  </P>
                  {report.interestingDisagreements.map((d) => {
                    const scores = d.scores.map(s => s.revised ?? s.score);
                    const spread = Math.max(...scores) - Math.min(...scores);
                    const highModel = d.scores.reduce((a, b) => ((b.revised ?? b.score) > (a.revised ?? a.score) ? b : a));
                    const lowModel = d.scores.reduce((a, b) => ((b.revised ?? b.score) < (a.revised ?? a.score) ? b : a));
                    return (
                      <div key={d.testCaseId} style={{
                        padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: '10px', marginBottom: '0.8rem',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <div style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-dim)' }}>
                            Case #{d.testCaseId} · {d.category}
                          </div>
                          <div style={{ ...mono, fontSize: '0.6rem', padding: '0.15rem 0.5rem', borderRadius: '4px', background: spread >= 30 ? 'rgba(220,38,38,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${spread >= 30 ? 'var(--red)' : 'var(--amber)'}`, color: spread >= 30 ? 'var(--red)' : 'var(--amber)', fontWeight: 700 }}>
                            {spread}pt spread
                          </div>
                        </div>
                        <div style={{ ...inter, fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.6rem', fontStyle: 'italic', lineHeight: 1.5 }}>
                          &ldquo;{d.workProductPreview}...&rdquo;
                        </div>
                        {/* Score comparison - visual */}
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                          {d.scores.map(s => {
                            const finalScore = s.revised ?? s.score;
                            const isHigh = s.model === highModel.model;
                            const isLow = s.model === lowModel.model;
                            return (
                              <div key={s.model} style={{
                                ...mono, fontSize: '0.62rem', padding: '0.4rem 0.6rem',
                                background: 'var(--bg)', borderRadius: '6px',
                                border: `1.5px solid ${isHigh ? 'var(--green)' : isLow ? 'var(--red)' : 'var(--border)'}`,
                                flex: '1 1 0', textAlign: 'center', minWidth: '120px',
                              }}>
                                <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>{s.model}</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: finalScore >= 70 ? 'var(--green)' : finalScore >= 40 ? 'var(--amber)' : 'var(--red)' }}>
                                  {finalScore}
                                </div>
                                <div style={{ fontSize: '0.5rem', color: 'var(--text-dim)' }}>
                                  {s.revised !== null ? `${s.score} → ${s.revised} (critique)` : s.classification}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ ...inter, fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{d.analysis}</div>
                      </div>
                    );
                  })}
                </>
              )}
            </Section>

            <Section title="5. Failure Modes">
              <P>
                {(() => {
                  const allFP = Object.values(report.falsePositives).reduce((a, b) => a + b, 0);
                  if (allFP === 0) return 'No false positives detected across all models - adversarial and mediocre cases were correctly identified.';
                  return `${allFP} false positive(s) detected - cases where useless work was scored as useful. These represent the most dangerous failure mode: an agent producing jargon-filled, substanceless output that passes quality review.`;
                })()}
              </P>
              <P>
                The adversarial test cases are specifically designed to exploit: verbosity bias (longer = better),
                confidence bias (authoritative tone = accurate), and jargon shielding (complex vocabulary = deep analysis).
                Self-critique principles target these exact biases.
              </P>
            </Section>

            <Section title="6. Implications">
              <P>
                Multi-model consensus{report.consensusAccuracy > Math.max(...report.modelsUsed.map(m => report.accuracy[m]?.overall ?? 0))
                  ? ` with self-critique achieves ${report.consensusAccuracy}% accuracy, outperforming`
                  : ` achieves ${report.consensusAccuracy}% accuracy compared to`} individual model scoring
                ({report.modelsUsed.map(m => `${m}: ${report.accuracy[m]?.overall ?? 0}%`).join(', ')}).
                {' '}The remaining failure cases suggest {
                  Object.values(report.falsePositives).reduce((a, b) => a + b, 0) > 0
                    ? 'that sophisticated adversarial outputs can still fool even multi-model review when the jargon closely mimics domain-specific language.'
                    : 'the system is robust against the test adversarial patterns, though real-world adversarial agents may develop more sophisticated evasion strategies.'
                }
                {' '}For production deployment, we recommend multi-model consensus with self-critique for chains above a cost threshold,
                with single-model fast scoring for low-stakes chains.
              </P>
              <P>
                Importantly: only TEE-attested scores (DeepSeek V3, GLM-5 via 0G Compute) go on-chain.
                Claude scores are used for evaluation comparison only. This separation - trustless scoring for the chain,
                comprehensive scoring for the audit - is intentional.
              </P>
            </Section>
          </>
        )}

        {!report && !running && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-dim)' }}>
            <div style={{ ...mono, fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text)' }}>Evaluation Harness</div>
            <P>Run the eval to generate a multi-model quality scoring report with Constitutional AI self-critique.</P>
          </div>
        )}
      </div>

      <footer style={{ marginTop: 'auto', padding: '0.8rem 1.5rem', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.68rem', color: 'var(--text-dim)', ...inter }}>
        <div style={{ display: 'flex', gap: '1.2rem' }}>
          {[['Live', '/demo'], ['Team', '/team'], ['Verify', '/verify']].map(([label, href]) =>
            <a key={href} href={href} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{label}</a>
          )}
          <a href="https://github.com/MorkeethHQ/receipt" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>GitHub</a>
        </div>
        <span style={{ ...mono, fontSize: '0.6rem' }}>Built for multi-agent systems.</span>
      </footer>
    </div>
  );
}
