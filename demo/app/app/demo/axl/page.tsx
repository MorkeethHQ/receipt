'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AxlEvent {
  id: number;
  timestamp: string;
  type: string;
  data: Record<string, unknown>;
}

type Phase = 'idle' | 'running' | 'done';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const AXL_EVENT_TYPES = new Set([
  'peer_discovery',
  'agent_card',
  'axl_handoff',
  'axl_received',
  'mcp_tool_call',
  'axl_rebroadcast',
  'axl_adopt',
]);

const PROTOCOL_CARDS = [
  {
    title: 'A2A Agent Discovery',
    endpoint: '/a2a/{peerId}',
    description:
      'Agent card exchange — capabilities, public key, supported protocols. Each peer publishes a machine-readable card so others know what it can do before sending work.',
    fields: ['name', 'capabilities[]', 'publicKey', 'supportedProtocols', 'receiptStandard'],
  },
  {
    title: 'P2P Handoff',
    endpoint: 'sendHandoffA2A()',
    description:
      'JSON-RPC 2.0 SendMessage envelope carries the receipt chain to a specific peer. Includes chain root hash, receipt count, and sender ed25519 public key for verification.',
    fields: ['chainRootHash', 'receiptCount', 'senderPubKey', 'receipts[]'],
  },
  {
    title: 'MCP Tool Calls',
    endpoint: 'callMcpTool()',
    description:
      'Remote procedure calls over the AXL mesh. The receiver exposes MCP services (verify_chain, get_capabilities, get_chain_stats) that callers invoke via /mcp/{peer}/{service}.',
    fields: ['verify_chain', 'get_capabilities', 'get_chain_stats'],
  },
  {
    title: 'Broadcast + Adopt',
    endpoint: 'broadcastHandoff()',
    description:
      'After extending the chain, the Builder broadcasts the completed work to all peers. The originator adopts the extended chain, closing the collaboration loop.',
    fields: ['broadcastMode: all-peers', 'adopter confirms rootHash', 'chain length validated'],
  },
];

const CODE_EXAMPLE = `import { AxlTransport } from '@receipt/sdk/integrations/axl';

const transport = new AxlTransport({ baseUrl: 'http://127.0.0.1:9002' });
await transport.connect();
const peers = await transport.discoverPeers();
const card = await transport.getAgentCard(peers[0]);

// Handoff receipt chain to Builder
await transport.sendHandoffA2A(peers[0], receipts, publicKey, {
  chainRootHash: computeRootHash(receipts),
  receiptCount: receipts.length,
  senderPubKey: agent.getPublicKeyHex(),
  receipts: receipts,
});

// Builder verifies via MCP
const result = await transport.callMcpTool(
  peers[0], 'receipt-agent', 'verify_chain',
  { chainRootHash, receiptCount: receipts.length }
);`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function eventLabel(type: string): string {
  const labels: Record<string, string> = {
    peer_discovery: 'Peer Discovery',
    agent_card: 'Agent Card',
    axl_handoff: 'AXL Handoff',
    axl_received: 'AXL Received',
    mcp_tool_call: 'MCP Tool Call',
    axl_rebroadcast: 'Rebroadcast',
    axl_adopt: 'Chain Adopted',
  };
  return labels[type] ?? type;
}

function eventColor(type: string): string {
  const colors: Record<string, string> = {
    peer_discovery: 'var(--researcher)',
    agent_card: 'var(--researcher)',
    axl_handoff: 'var(--builder)',
    axl_received: 'var(--builder)',
    mcp_tool_call: 'var(--green)',
    axl_rebroadcast: 'var(--amber)',
    axl_adopt: 'var(--green)',
  };
  return colors[type] ?? 'var(--text-muted)';
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AxlDemoPage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [events, setEvents] = useState<AxlEvent[]>([]);
  const [handoffActive, setHandoffActive] = useState(false);
  const [transportInfo, setTransportInfo] = useState({
    method: 'A2A + MCP',
    protocol: 'JSON-RPC 2.0 over AXL P2P',
    receiptCount: 0,
  });
  const eventIdRef = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events]);

  const runDemo = useCallback(async () => {
    if (phase === 'running') return;
    setPhase('running');
    setEvents([]);
    setHandoffActive(true);
    eventIdRef.current = 0;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adversarial: false }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setPhase('done');
        setHandoffActive(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let currentEventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEventType) {
            if (AXL_EVENT_TYPES.has(currentEventType)) {
              try {
                const data = JSON.parse(line.slice(6));
                const now = new Date();
                const ts = now.toLocaleTimeString('en-US', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }) + '.' + String(now.getMilliseconds()).padStart(3, '0');

                setEvents((prev) => [
                  ...prev,
                  { id: ++eventIdRef.current, timestamp: ts, type: currentEventType, data },
                ]);

                // Update transport info
                if (currentEventType === 'axl_handoff' || currentEventType === 'axl_rebroadcast') {
                  setTransportInfo((prev) => ({
                    ...prev,
                    receiptCount: (data.receiptCount as number) ?? prev.receiptCount,
                  }));
                }
              } catch {
                // skip malformed
              }
            }

            if (currentEventType === 'done') {
              setPhase('done');
              setHandoffActive(false);
            }
            currentEventType = '';
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        console.error('SSE error:', err);
      }
    }

    setPhase('done');
    setHandoffActive(false);
  }, [phase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Styles (inline, self-contained)                                  */
  /* ---------------------------------------------------------------- */

  const mono: React.CSSProperties = {
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
  };

  const sans: React.CSSProperties = {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  };

  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '1.2rem',
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <nav style={{
        padding: '0.6rem 1.5rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <a href="/" style={{ ...mono, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', textDecoration: 'none', letterSpacing: '0.03em' }}>
          R.E.C.E.I.P.T.
        </a>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <a href="/" style={{ ...sans, fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none' }}>Home</a>
          <a href="/demo" style={{ ...sans, fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none' }}>Demo</a>
          <a href="/demo/axl" style={{ ...sans, fontSize: '0.75rem', color: 'var(--text)', textDecoration: 'none', fontWeight: 600 }}>AXL</a>
          <a href="/verify" style={{ ...sans, fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none' }}>Verify</a>
          <a href="/dashboard" style={{ ...sans, fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none' }}>Dashboard</a>
        </div>
      </nav>

      {/* Content */}
      <main style={{ flex: 1, maxWidth: '960px', width: '100%', margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* ---- Section 1: Header ---- */}
        <section style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <h1 style={{ ...mono, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              Gensyn AXL &mdash; P2P Agent Handoff
            </h1>
            <span style={{
              ...mono,
              fontSize: '0.6rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              padding: '0.15rem 0.5rem',
              borderRadius: '3px',
              background: '#fef3c7',
              color: 'var(--amber)',
              border: '1px solid #fde68a',
            }}>
              SIMULATED
            </span>
          </div>
          <p style={{ ...sans, fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.55, margin: 0 }}>
            Receipt chains transfer between agents over Gensyn&apos;s AXL peer-to-peer network.
          </p>
          <p style={{ ...mono, fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
            Simulated on hosted demo. Connect local AXL node for live P2P.
          </p>
        </section>

        {/* ---- Section 2: Topology Visualization ---- */}
        <section style={{ ...card, marginBottom: '2rem', position: 'relative', overflow: 'hidden' }}>
          <h2 style={{ ...mono, fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '1.5rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Network Topology
          </h2>

          {/* Agent circles + connecting line */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0', position: 'relative', padding: '1.5rem 0' }}>

            {/* Researcher circle */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
              <div style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: 'var(--surface)',
                border: `3px solid var(--researcher)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: handoffActive ? '0 0 16px rgba(37, 99, 235, 0.3)' : '0 1px 4px rgba(0,0,0,0.08)',
                transition: 'box-shadow 0.3s ease',
              }}>
                <span style={{ ...mono, fontSize: '1.3rem', fontWeight: 700, color: 'var(--researcher)' }}>R</span>
              </div>
              <span style={{ ...mono, fontSize: '0.65rem', color: 'var(--researcher)', marginTop: '0.4rem', fontWeight: 600 }}>Researcher</span>
            </div>

            {/* Connecting line with animated packets */}
            <div style={{ position: 'relative', width: '240px', height: '4px', margin: '0 1.5rem', marginBottom: '1.2rem' }}>
              <div style={{
                position: 'absolute',
                top: '1px',
                left: 0,
                right: 0,
                height: '2px',
                background: handoffActive ? 'var(--border)' : 'var(--border-dashed)',
                borderRadius: '1px',
              }} />
              {handoffActive && (
                <>
                  <div style={{
                    position: 'absolute',
                    top: '-2px',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--researcher)',
                    animation: 'axl-packet-traverse 1.5s ease-in-out infinite',
                  }} />
                  <div style={{
                    position: 'absolute',
                    top: '-2px',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--builder)',
                    animation: 'axl-packet-traverse 1.5s ease-in-out infinite 0.75s',
                  }} />
                </>
              )}
            </div>

            {/* Builder circle */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
              <div style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: 'var(--surface)',
                border: `3px solid var(--builder)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: handoffActive ? '0 0 16px rgba(124, 58, 237, 0.3)' : '0 1px 4px rgba(0,0,0,0.08)',
                transition: 'box-shadow 0.3s ease',
              }}>
                <span style={{ ...mono, fontSize: '1.3rem', fontWeight: 700, color: 'var(--builder)' }}>B</span>
              </div>
              <span style={{ ...mono, fontSize: '0.65rem', color: 'var(--builder)', marginTop: '0.4rem', fontWeight: 600 }}>Builder</span>
            </div>
          </div>

          {/* Transport details */}
          <div style={{
            display: 'flex',
            gap: '2rem',
            justifyContent: 'center',
            paddingTop: '1rem',
            borderTop: '1px dashed var(--border-dashed)',
          }}>
            {[
              { label: 'Method', value: transportInfo.method },
              { label: 'Protocol', value: transportInfo.protocol },
              { label: 'Receipts', value: String(transportInfo.receiptCount) },
            ].map((item) => (
              <div key={item.label} style={{ textAlign: 'center' }}>
                <div style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {item.label}
                </div>
                <div style={{ ...mono, fontSize: '0.75rem', color: 'var(--text)', fontWeight: 500, marginTop: '0.2rem' }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---- Section 3: Protocol Detail Cards ---- */}
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ ...mono, fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '1rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Protocol Details
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '1rem' }}>
            {PROTOCOL_CARDS.map((pc) => (
              <div key={pc.title} style={{ ...card }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                  <h3 style={{ ...mono, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                    {pc.title}
                  </h3>
                  <code style={{ ...mono, fontSize: '0.62rem', color: 'var(--text-dim)', background: 'var(--bg)', padding: '0.15rem 0.4rem', borderRadius: '3px' }}>
                    {pc.endpoint}
                  </code>
                </div>
                <p style={{ ...sans, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 0.6rem 0' }}>
                  {pc.description}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {pc.fields.map((f) => (
                    <span key={f} style={{
                      ...mono,
                      fontSize: '0.6rem',
                      color: 'var(--text-dim)',
                      background: 'var(--bg)',
                      padding: '0.12rem 0.4rem',
                      borderRadius: '3px',
                      border: '1px solid var(--border)',
                    }}>
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---- Section 4: Code Example ---- */}
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ ...mono, fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '1rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            SDK Usage
          </h2>
          <div style={{
            ...card,
            background: '#1e1e2e',
            border: '1px solid #313244',
            padding: '1.2rem 1.4rem',
            overflowX: 'auto',
          }}>
            <pre style={{
              ...mono,
              fontSize: '0.72rem',
              lineHeight: 1.65,
              color: '#cdd6f4',
              margin: 0,
              whiteSpace: 'pre',
              tabSize: 2,
            }}>
              {CODE_EXAMPLE.split('\n').map((line, i) => {
                // Basic syntax highlighting
                let colored = line;
                const isComment = line.trimStart().startsWith('//');
                const isImport = line.trimStart().startsWith('import') || line.trimStart().startsWith('from');
                const isKeyword = /^\s*(const|await|new)\b/.test(line);

                if (isComment) {
                  return <div key={i} style={{ color: '#6c7086' }}>{line}</div>;
                }
                if (isImport) {
                  return (
                    <div key={i}>
                      <span style={{ color: '#cba6f7' }}>
                        {line.replace(/'[^']+'/g, (m) => `\x00${m}\x01`).split('\x00').map((part, j) => {
                          if (part.includes('\x01')) {
                            const [str, rest] = part.split('\x01');
                            return <span key={j}><span style={{ color: '#a6e3a1' }}>{str}</span>{rest}</span>;
                          }
                          return <span key={j} style={{ color: '#cba6f7' }}>{part}</span>;
                        })}
                      </span>
                    </div>
                  );
                }
                if (isKeyword) {
                  return (
                    <div key={i}>
                      {line.replace(/\b(const|await|new)\b/g, '\x00$1\x01').split('\x00').map((part, j) => {
                        if (part.includes('\x01')) {
                          const [kw, rest] = part.split('\x01');
                          return <span key={j}><span style={{ color: '#cba6f7' }}>{kw}</span>{rest}</span>;
                        }
                        return <span key={j}>{part}</span>;
                      })}
                    </div>
                  );
                }

                return <div key={i}>{colored}</div>;
              })}
            </pre>
          </div>
        </section>

        {/* ---- Section 5: Try It ---- */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ ...mono, fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '1rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Try It
          </h2>

          <button
            onClick={runDemo}
            disabled={phase === 'running'}
            style={{
              ...mono,
              fontSize: '0.78rem',
              fontWeight: 600,
              padding: '0.6rem 1.6rem',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              background: phase === 'running' ? 'var(--bg)' : 'var(--surface)',
              color: phase === 'running' ? 'var(--text-dim)' : 'var(--text)',
              cursor: phase === 'running' ? 'not-allowed' : 'pointer',
              marginBottom: '1rem',
              transition: 'all 0.15s ease',
            }}
          >
            {phase === 'idle' && 'Run AXL Handoff'}
            {phase === 'running' && 'Running...'}
            {phase === 'done' && 'Run Again'}
          </button>

          {phase === 'running' && (
            <span style={{ ...mono, fontSize: '0.65rem', color: 'var(--text-dim)', marginLeft: '0.8rem' }}>
              Streaming AXL events...
            </span>
          )}

          {/* Event Timeline/Log */}
          <div
            ref={logRef}
            style={{
              ...card,
              maxHeight: '420px',
              overflowY: 'auto',
              padding: events.length === 0 ? '2rem 1.2rem' : '0.6rem 0',
            }}
          >
            {events.length === 0 && phase !== 'running' && (
              <p style={{ ...mono, fontSize: '0.72rem', color: 'var(--text-dim)', textAlign: 'center', margin: 0 }}>
                {phase === 'idle'
                  ? 'Press "Run AXL Handoff" to see P2P events in real time.'
                  : 'No AXL events captured in this run.'}
              </p>
            )}

            {events.map((evt, idx) => (
              <div
                key={evt.id}
                className="slide-up"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  padding: '0.55rem 1rem',
                  borderBottom: idx < events.length - 1 ? '1px solid var(--border)' : 'none',
                  gap: '0.8rem',
                }}
              >
                {/* Timestamp */}
                <span style={{ ...mono, fontSize: '0.62rem', color: 'var(--text-dim)', whiteSpace: 'nowrap', flexShrink: 0, marginTop: '0.1rem' }}>
                  {evt.timestamp}
                </span>

                {/* Event type badge */}
                <span style={{
                  ...mono,
                  fontSize: '0.58rem',
                  fontWeight: 600,
                  color: eventColor(evt.type),
                  background: `color-mix(in srgb, ${eventColor(evt.type)} 8%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${eventColor(evt.type)} 25%, transparent)`,
                  padding: '0.1rem 0.45rem',
                  borderRadius: '3px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}>
                  {eventLabel(evt.type)}
                </span>

                {/* Event detail */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <EventDetail type={evt.type} data={evt.data} />
                </div>
              </div>
            ))}

            {phase === 'running' && events.length > 0 && (
              <div style={{ padding: '0.5rem 1rem' }}>
                <span className="typing-indicator" style={{ ...mono, fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                  Listening
                </span>
              </div>
            )}
          </div>

          {phase === 'done' && events.length > 0 && (
            <div style={{
              ...mono,
              fontSize: '0.65rem',
              color: 'var(--text-dim)',
              marginTop: '0.6rem',
              textAlign: 'right',
            }}>
              {events.length} AXL event{events.length !== 1 ? 's' : ''} captured
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer style={{
        padding: '0.8rem 1.5rem',
        borderTop: '1px solid var(--border)',
        background: 'var(--surface)',
        textAlign: 'center',
        flexShrink: 0,
      }}>
        <span style={{ ...mono, fontSize: '0.62rem', color: 'var(--text-dim)' }}>
          RECEIPT &mdash; Gensyn AXL Integration &mdash; ETHGlobal 2026
        </span>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Event Detail Sub-component                                         */
/* ------------------------------------------------------------------ */

function EventDetail({ type, data }: { type: string; data: Record<string, unknown> }) {
  const mono: React.CSSProperties = {
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
  };

  switch (type) {
    case 'peer_discovery': {
      const peers = (data.peers as Array<{ name: string; role: string; status: string }>) ?? [];
      const mode = data.mode as string ?? 'simulated';
      return (
        <div style={{ ...mono, fontSize: '0.65rem', color: 'var(--text)' }}>
          <span style={{ color: 'var(--text-muted)' }}>
            {peers.length} peer{peers.length !== 1 ? 's' : ''} found
          </span>
          <span style={{ color: 'var(--text-dim)', marginLeft: '0.5rem' }}>
            topology: {data.topology as string ?? 'mesh'} | mode: {mode}
          </span>
          <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {peers.map((p, i) => (
              <span key={i} style={{
                fontSize: '0.6rem',
                color: p.role === 'researcher' ? 'var(--researcher)' : p.role === 'builder' ? 'var(--builder)' : 'var(--text-muted)',
              }}>
                {p.name} ({p.role})
              </span>
            ))}
          </div>
        </div>
      );
    }

    case 'agent_card': {
      const agentName = data.agent as string ?? '';
      const cardData = data.card as Record<string, unknown> ?? {};
      return (
        <div style={{ ...mono, fontSize: '0.65rem', color: 'var(--text)' }}>
          <span>{agentName}</span>
          <span style={{ color: 'var(--text-dim)', marginLeft: '0.5rem' }}>
            caps: {((cardData.capabilities as string[]) ?? []).join(', ')}
          </span>
        </div>
      );
    }

    case 'axl_handoff': {
      const from = data.fromName as string ?? data.from as string ?? '';
      const to = data.to as string ?? '';
      const count = data.receiptCount as number ?? 0;
      return (
        <div style={{ ...mono, fontSize: '0.65rem', color: 'var(--text)' }}>
          <span style={{ color: 'var(--researcher)' }}>{from}</span>
          <span style={{ color: 'var(--text-dim)' }}> &rarr; </span>
          <span style={{ color: 'var(--builder)' }}>{to}</span>
          <span style={{ color: 'var(--text-dim)', marginLeft: '0.5rem' }}>
            {count} receipt{count !== 1 ? 's' : ''} | protocol: {data.protocol as string ?? 'A2A'}
          </span>
        </div>
      );
    }

    case 'axl_received': {
      const receiver = data.receiverName as string ?? '';
      const sender = data.fromName as string ?? '';
      const verified = data.verified as boolean;
      return (
        <div style={{ ...mono, fontSize: '0.65rem', color: 'var(--text)' }}>
          <span style={{ color: 'var(--builder)' }}>{receiver}</span>
          <span style={{ color: 'var(--text-dim)' }}> received from </span>
          <span style={{ color: 'var(--researcher)' }}>{sender}</span>
          <span style={{ color: verified ? 'var(--green)' : 'var(--red)', marginLeft: '0.5rem' }}>
            {verified ? 'verified' : 'verification failed'}
          </span>
        </div>
      );
    }

    case 'mcp_tool_call': {
      const tool = data.tool as string ?? '';
      const caller = data.caller as string ?? '';
      const output = data.output as Record<string, unknown> ?? {};
      return (
        <div style={{ ...mono, fontSize: '0.65rem', color: 'var(--text)' }}>
          <span style={{ color: 'var(--green)' }}>{tool}</span>
          <span style={{ color: 'var(--text-dim)' }}> called by {caller}</span>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.6rem', marginTop: '0.15rem', wordBreak: 'break-all' }}>
            {JSON.stringify(output).slice(0, 120)}
          </div>
        </div>
      );
    }

    case 'axl_rebroadcast': {
      const from = data.fromName as string ?? '';
      const count = data.receiptCount as number ?? 0;
      return (
        <div style={{ ...mono, fontSize: '0.65rem', color: 'var(--text)' }}>
          <span style={{ color: 'var(--builder)' }}>{from}</span>
          <span style={{ color: 'var(--text-dim)' }}>
            {' '}broadcast {count} receipts to all peers ({data.broadcastMode as string ?? 'all-peers'})
          </span>
        </div>
      );
    }

    case 'axl_adopt': {
      const adopter = data.adopter as string ?? '';
      const from = data.from as string ?? '';
      const finalLen = data.finalLength as number ?? 0;
      return (
        <div style={{ ...mono, fontSize: '0.65rem', color: 'var(--text)' }}>
          <span style={{ color: 'var(--researcher)' }}>{adopter}</span>
          <span style={{ color: 'var(--text-dim)' }}> adopted chain from </span>
          <span style={{ color: 'var(--builder)' }}>{from}</span>
          <span style={{ color: 'var(--green)', marginLeft: '0.5rem' }}>
            final: {finalLen} receipts
          </span>
        </div>
      );
    }

    default:
      return (
        <div style={{ ...mono, fontSize: '0.65rem', color: 'var(--text-dim)' }}>
          {JSON.stringify(data).slice(0, 200)}
        </div>
      );
  }
}
