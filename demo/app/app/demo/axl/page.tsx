'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

interface PeerInfo {
  name: string;
  pubkey: string;
  role: string;
  status: string;
}

type Phase = 'idle' | 'running' | 'done';

interface NodeEvent {
  id: string;
  text: string;
  type: 'info' | 'receipt' | 'handoff' | 'verify' | 'mcp' | 'fail' | 'success' | 'rebroadcast' | 'adopt';
  timestamp: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const mono = { fontFamily: "'IBM Plex Mono', 'Courier New', monospace" } as const;

function getDelay(event: string): number {
  switch (event) {
    case 'receipt': return 1600;
    case 'verified': return 800;
    case 'fabrication_detected': return 2200;
    case 'verification_complete': return 1000;
    case 'tampered': return 1200;
    case 'status': return 700;
    case 'done': return 500;
    case 'trust_score': return 800;
    case 'agentic_id': return 700;
    case 'axl_handoff': return 1400;
    case 'axl_received': return 1200;
    case 'axl_rebroadcast': return 1000;
    case 'axl_adopt': return 1000;
    case 'mcp_tool_call': return 900;
    case 'peer_discovery': return 600;
    case 'agent_card': return 800;
    case 'tee_verified': return 1000;
    default: return 500;
  }
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function AxlDemo() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [senderEvents, setSenderEvents] = useState<NodeEvent[]>([]);
  const [receiverEvents, setReceiverEvents] = useState<NodeEvent[]>([]);
  const [senderReceipts, setSenderReceipts] = useState<Receipt[]>([]);
  const [receiverReceipts, setReceiverReceipts] = useState<Receipt[]>([]);
  const [a2aEnvelope, setA2aEnvelope] = useState<object | null>(null);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [packetAnimating, setPacketAnimating] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<string>('offline');
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [totalReceipts, setTotalReceipts] = useState(0);
  const [handoffComplete, setHandoffComplete] = useState(false);
  const [fabricationDetected, setFabricationDetected] = useState(false);
  const [agentACount, setAgentACount] = useState(0);

  const senderRef = useRef<HTMLDivElement>(null);
  const receiverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    senderRef.current?.scrollTo({ top: senderRef.current.scrollHeight, behavior: 'smooth' });
  }, [senderEvents, senderReceipts]);

  useEffect(() => {
    receiverRef.current?.scrollTo({ top: receiverRef.current.scrollHeight, behavior: 'smooth' });
  }, [receiverEvents, receiverReceipts]);

  const addSenderEvent = useCallback((text: string, type: NodeEvent['type']) => {
    setSenderEvents(prev => [...prev, { id: uid(), text, type, timestamp: Date.now() }]);
  }, []);

  const addReceiverEvent = useCallback((text: string, type: NodeEvent['type']) => {
    setReceiverEvents(prev => [...prev, { id: uid(), text, type, timestamp: Date.now() }]);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Event handler                                                    */
  /* ---------------------------------------------------------------- */

  const handleEvent = useCallback((event: string, data: any) => {
    switch (event) {
      case 'status': {
        const msg = data.message || '';
        if (msg.includes('Agent A')) {
          addSenderEvent(msg, 'info');
        } else if (msg.includes('Agent B')) {
          addReceiverEvent(msg, 'info');
        } else {
          addSenderEvent(msg, 'info');
        }
        break;
      }
      case 'receipt': {
        const receipt = data.receipt as Receipt;
        setTotalReceipts(prev => prev + 1);
        if (data.agent === 'A') {
          setSenderReceipts(prev => [...prev, receipt]);
          addSenderEvent(`Receipt: ${receipt.action.type} -- ${receipt.action.description.slice(0, 60)}`, 'receipt');
        } else {
          setReceiverReceipts(prev => [...prev, receipt]);
          addReceiverEvent(`Receipt: ${receipt.action.type} -- ${receipt.action.description.slice(0, 60)}`, 'receipt');
        }
        break;
      }
      case 'peer_discovery': {
        if (data.peers) {
          setPeers(data.peers);
          setNetworkStatus('connected');
          addSenderEvent(`Discovered ${data.peers.length} peers (${data.topology || 'mesh'})`, 'info');
          addReceiverEvent(`Peer discovered: ${data.peers.length} nodes online`, 'info');
        }
        break;
      }
      case 'agent_card': {
        const name = data.name || data.agentName || 'unknown';
        addSenderEvent(`Agent card: ${name} -- capabilities: ${(data.capabilities || []).join(', ')}`, 'info');
        break;
      }
      case 'axl_handoff': {
        setPacketAnimating(true);
        setHandoffComplete(false);
        setNetworkStatus('transmitting');
        if (data.envelope) {
          setA2aEnvelope(data.envelope);
        }
        addSenderEvent(`AXL broadcast: ${data.receiptCount} receipts via ${data.protocol || 'A2A'}`, 'handoff');
        setTimeout(() => {
          setPacketAnimating(false);
          setNetworkStatus('connected');
        }, 2500);
        break;
      }
      case 'axl_received': {
        setHandoffComplete(true);
        addReceiverEvent(`AXL received: ${data.receiptCount} receipts from ${data.fromName || data.from}`, 'handoff');
        break;
      }
      case 'axl_rebroadcast': {
        setPacketAnimating(true);
        addReceiverEvent(`Re-broadcast: extended chain (${data.receiptCount || '?'} receipts) to network`, 'rebroadcast');
        setTimeout(() => setPacketAnimating(false), 1800);
        break;
      }
      case 'axl_adopt': {
        addSenderEvent(`Adopted extended chain from ${data.fromName || data.from || 'Agent B'}`, 'adopt');
        break;
      }
      case 'verified': {
        if (data.result?.valid) {
          setVerifiedCount(prev => prev + 1);
          addReceiverEvent(`Verified: ${data.result.receiptId.slice(0, 8)}... PASS`, 'verify');
        } else {
          addReceiverEvent(`Verified: ${data.result?.receiptId?.slice(0, 8)}... FAIL`, 'fail');
        }
        break;
      }
      case 'verification_complete': {
        if (data.valid) {
          addReceiverEvent('All receipts verified -- chain is authentic', 'success');
        } else {
          addReceiverEvent('Verification failed -- chain rejected', 'fail');
        }
        break;
      }
      case 'fabrication_detected': {
        setFabricationDetected(true);
        addReceiverEvent('FABRICATION DETECTED -- handoff rejected', 'fail');
        break;
      }
      case 'mcp_tool_call': {
        addReceiverEvent(`MCP: ${data.tool} via ${data.protocol || 'MCP over A2A'}`, 'mcp');
        break;
      }
      case 'tee_verified': {
        addSenderEvent(`TEE verified: ${data.provider || 'TeeML'} -- ${data.verificationMethod || 'Intel TDX'}`, 'success');
        break;
      }
      case 'tampered': {
        addSenderEvent(`Receipt tampered: index ${data.index}`, 'fail');
        break;
      }
      case 'trust_score': {
        addReceiverEvent(`Trust score: ${data.score}/100`, 'success');
        break;
      }
      case 'storage': {
        addReceiverEvent(`Anchored on 0G Storage`, 'success');
        break;
      }
      case 'done': {
        if (data.agentACount) setAgentACount(data.agentACount);
        if (data.fabricated) {
          setFabricationDetected(true);
        }
        break;
      }
    }
  }, [addSenderEvent, addReceiverEvent]);

  /* ---------------------------------------------------------------- */
  /*  Run                                                              */
  /* ---------------------------------------------------------------- */

  const run = useCallback(async () => {
    setPhase('running');
    setSenderEvents([]);
    setReceiverEvents([]);
    setSenderReceipts([]);
    setReceiverReceipts([]);
    setA2aEnvelope(null);
    setPeers([]);
    setPacketAnimating(false);
    setNetworkStatus('discovering');
    setVerifiedCount(0);
    setTotalReceipts(0);
    setHandoffComplete(false);
    setFabricationDetected(false);
    setAgentACount(0);

    const events: Array<{ event: string; data: any }> = [];

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adversarial: false }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        let ev = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) ev = line.slice(7);
          else if (line.startsWith('data: ') && ev) {
            events.push({ event: ev, data: JSON.parse(line.slice(6)) });
            ev = '';
          }
        }
      }
    } catch { /* SSE fetch failed */ }

    for (const { event, data } of events) {
      handleEvent(event, data);
      await new Promise(r => setTimeout(r, getDelay(event)));
    }

    setPhase('done');
  }, [handleEvent]);

  /* ---------------------------------------------------------------- */
  /*  Render: Node Event                                               */
  /* ---------------------------------------------------------------- */

  const eventColor = (type: NodeEvent['type']): string => {
    switch (type) {
      case 'receipt': return 'var(--text)';
      case 'handoff': return 'var(--agent-a)';
      case 'verify': return 'var(--green)';
      case 'mcp': return 'var(--agent-b)';
      case 'fail': return 'var(--red)';
      case 'success': return 'var(--green)';
      case 'rebroadcast': return 'var(--agent-b)';
      case 'adopt': return 'var(--agent-a)';
      default: return 'var(--text-muted)';
    }
  };

  const eventBg = (type: NodeEvent['type']): string => {
    switch (type) {
      case 'fail': return '#fef2f2';
      case 'handoff': return '#f0f4ff';
      case 'success': return '#f0fdf4';
      case 'rebroadcast': return '#f5f3ff';
      case 'adopt': return '#eff6ff';
      default: return 'transparent';
    }
  };

  const renderNodeEvent = (ev: NodeEvent) => (
    <div key={ev.id} className="slide-up" style={{
      ...mono, fontSize: '0.58rem', padding: '0.3rem 0.5rem',
      borderRadius: '4px', lineHeight: 1.5,
      color: eventColor(ev.type),
      background: eventBg(ev.type),
      borderLeft: `2px solid ${eventColor(ev.type)}`,
    }}>
      {ev.text}
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Receipt mini-card                                        */
  /* ---------------------------------------------------------------- */

  const renderMiniReceipt = (receipt: Receipt, index: number) => (
    <div key={receipt.id} className="slide-up" style={{ maxWidth: '280px', width: '100%' }}>
      <div className="receipt-card" style={{ fontSize: '0.6rem' }}>
        <div style={{ padding: '0.3rem 0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ ...mono, fontWeight: 700, fontSize: '0.55rem', letterSpacing: '0.04em' }}>R.E.C.E.I.P.T.</span>
          <span style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)' }}>#{index}</span>
        </div>
        <div className="dashed" />
        <div style={{ padding: '0.25rem 0.5rem', ...mono, fontSize: '0.55rem', lineHeight: 1.7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>ACTION</span>
            <span style={{ fontWeight: 600 }}>{receipt.action.type}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>TIME</span>
            <span>{new Date(receipt.timestamp).toLocaleTimeString()}</span>
          </div>
        </div>
        <div className="dashed" />
        <div style={{ padding: '0.2rem 0.5rem', ...mono, fontSize: '0.48rem', color: 'var(--text-muted)' }}>
          <div>IN  {receipt.inputHash.slice(0, 16)}...</div>
          <div>OUT {receipt.outputHash.slice(0, 16)}...</div>
        </div>
        <div className="dashed" />
        <div style={{ padding: '0.2rem 0.5rem', ...mono, fontSize: '0.48rem', color: 'var(--text-dim)' }}>
          SIG {receipt.signature.slice(0, 16)}...
        </div>
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Idle                                                     */
  /* ---------------------------------------------------------------- */

  const renderIdle = () => (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center', maxWidth: '560px' }}>
        <div style={{ ...mono, fontSize: '1.6rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.3rem', letterSpacing: '0.05em' }}>
          AXL Network Demo
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: '1.5rem', ...mono }}>
          Gensyn AXL -- A2A Protocol for agent-to-agent receipt handoff
        </p>
        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '2rem' }}>
          Watch the sender and receiver nodes negotiate a receipt chain handoff over the AXL peer-to-peer protocol.
          The sender broadcasts its signed receipt chain, the receiver verifies it, then continues the work.
        </p>

        {/* Network topology preview */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem',
          marginBottom: '2rem', padding: '1.2rem 1.5rem',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%', background: 'var(--agent-a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: '0.9rem', margin: '0 auto 0.3rem',
            }}>A</div>
            <div style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-muted)' }}>Sender</div>
          </div>
          <div style={{ flex: 1, maxWidth: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
            <div style={{ width: '100%', height: '2px', background: 'var(--border)' }} />
            <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)' }}>AXL / A2A</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%', background: 'var(--agent-b)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: '0.9rem', margin: '0 auto 0.3rem',
            }}>B</div>
            <div style={{ ...mono, fontSize: '0.6rem', color: 'var(--text-muted)' }}>Receiver</div>
          </div>
        </div>

        <button onClick={run} style={{
          padding: '0.8rem 2.5rem', borderRadius: '8px', border: 'none',
          background: 'var(--text)', color: '#fff', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: '1rem', fontWeight: 600,
          transition: 'all 0.2s ease',
        }}>
          Start Demo
        </button>

        <div style={{ marginTop: '1.2rem' }}>
          <a href="/demo" style={{ ...mono, fontSize: '0.65rem', color: 'var(--text-dim)', textDecoration: 'none', borderBottom: '1px dashed var(--border-dashed)' }}>
            Back to Receipt Demo
          </a>
        </div>
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Network bar (between panels)                             */
  /* ---------------------------------------------------------------- */

  const renderNetworkBar = () => (
    <div style={{
      width: '200px', display: 'flex', flexDirection: 'column',
      background: 'var(--surface)', borderLeft: '1px solid var(--border)',
      borderRight: '1px solid var(--border)', flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '0.6rem 0.8rem', borderBottom: '1px solid var(--border)',
        textAlign: 'center',
      }}>
        <div style={{ ...mono, fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text)' }}>
          AXL NETWORK
        </div>
        <div style={{
          ...mono, fontSize: '0.5rem', marginTop: '0.2rem',
          color: networkStatus === 'transmitting' ? 'var(--agent-a)'
            : networkStatus === 'connected' ? 'var(--green)'
            : networkStatus === 'discovering' ? 'var(--amber)'
            : 'var(--text-dim)',
        }}>
          {networkStatus.toUpperCase()}
        </div>
      </div>

      {/* Connection visualization */}
      <div style={{
        padding: '1rem 0.8rem', borderBottom: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
      }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '50%', background: 'var(--agent-a)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '0.6rem', fontWeight: 700,
        }}>A</div>

        {/* Vertical line with packet */}
        <div style={{
          width: '2px', height: '60px', background: 'var(--border)',
          position: 'relative', overflow: 'hidden',
        }}>
          {packetAnimating && (
            <div style={{
              position: 'absolute', left: '-3px',
              width: '8px', height: '8px', borderRadius: '50%',
              background: 'var(--agent-a)',
              animation: 'axl-packet-vertical 1.5s ease-in-out infinite',
            }} />
          )}
        </div>

        <div style={{
          width: '28px', height: '28px', borderRadius: '50%', background: 'var(--agent-b)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '0.6rem', fontWeight: 700,
        }}>B</div>
      </div>

      {/* Peers */}
      {peers.length > 0 && (
        <div style={{ padding: '0.5rem 0.8rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ ...mono, fontSize: '0.5rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '0.3rem' }}>
            PEERS ({peers.length})
          </div>
          {peers.map((p, i) => (
            <div key={i} style={{
              ...mono, fontSize: '0.48rem', color: 'var(--text-muted)',
              padding: '0.15rem 0', display: 'flex', justifyContent: 'space-between',
            }}>
              <span>{p.name?.split('.')[0] || `peer-${i}`}</span>
              <span style={{ color: p.status === 'online' ? 'var(--green)' : 'var(--text-dim)', fontSize: '0.45rem' }}>
                {p.status || 'unknown'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* A2A Envelope */}
      {a2aEnvelope && (
        <div style={{ padding: '0.5rem 0.6rem', flex: 1, overflow: 'auto' }}>
          <div style={{ ...mono, fontSize: '0.5rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '0.3rem' }}>
            A2A ENVELOPE
          </div>
          <pre style={{
            ...mono, fontSize: '0.45rem', color: 'var(--text-muted)', lineHeight: 1.5,
            background: 'var(--bg)', padding: '0.4rem', borderRadius: '4px',
            border: '1px solid var(--border)', overflow: 'auto', maxHeight: '200px',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {JSON.stringify(a2aEnvelope, null, 2)}
          </pre>
        </div>
      )}

      {/* Stats */}
      <div style={{ padding: '0.5rem 0.8rem', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>
          <span>Receipts</span>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{totalReceipts}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>
          <span>Verified</span>
          <span style={{ fontWeight: 600, color: verifiedCount > 0 ? 'var(--green)' : 'var(--text-dim)' }}>{verifiedCount}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', ...mono, fontSize: '0.5rem', color: 'var(--text-dim)' }}>
          <span>Handoff</span>
          <span style={{
            fontWeight: 600,
            color: fabricationDetected ? 'var(--red)' : handoffComplete ? 'var(--green)' : 'var(--text-dim)',
          }}>
            {fabricationDetected ? 'REJECTED' : handoffComplete ? 'COMPLETE' : 'PENDING'}
          </span>
        </div>
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Node Panel                                               */
  /* ---------------------------------------------------------------- */

  const renderNodePanel = (
    side: 'sender' | 'receiver',
    events: NodeEvent[],
    receipts: Receipt[],
    ref: React.RefObject<HTMLDivElement | null>,
  ) => {
    const isSender = side === 'sender';
    const color = isSender ? 'var(--agent-a)' : 'var(--agent-b)';
    const label = isSender ? 'A' : 'B';
    const name = isSender ? 'Sender Node' : 'Receiver Node';
    const role = isSender ? 'researcher.receiptagent.eth' : 'builder.receiptagent.eth';
    const isActive = phase === 'running';
    const startIndex = isSender ? 0 : agentACount;

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden',
        borderLeft: !isSender && isActive ? `3px solid ${color}` : undefined,
        borderRight: isSender && isActive ? `3px solid ${color}` : undefined,
        transition: 'border 0.3s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '0.6rem 1rem', borderBottom: '1px solid var(--border)',
          background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: '0.5rem',
          flexShrink: 0,
        }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%', background: color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: '0.65rem',
            boxShadow: isActive ? `0 0 0 3px ${color}33` : 'none',
            transition: 'box-shadow 0.3s ease',
          }}>{label}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>{name}</div>
            <div style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-dim)' }}>{role}</div>
          </div>
          {receipts.length > 0 && (
            <div style={{
              ...mono, fontSize: '0.5rem', padding: '0.15rem 0.4rem',
              borderRadius: '4px', background: 'var(--bg)', border: '1px solid var(--border)',
              color: 'var(--text-muted)',
            }}>
              {receipts.length} receipts
            </div>
          )}
        </div>

        {/* Event log + receipts */}
        <div ref={ref} style={{
          flex: 1, overflowY: 'auto', padding: '0.6rem',
          display: 'flex', flexDirection: 'column', gap: '0.4rem',
          background: 'var(--bg)',
        }}>
          {events.map(renderNodeEvent)}

          {/* Receipt cards at the bottom */}
          {receipts.length > 0 && (
            <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ ...mono, fontSize: '0.5rem', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.04em' }}>
                RECEIPT CHAIN
              </div>
              {receipts.map((r, i) => renderMiniReceipt(r, startIndex + i))}
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ---------------------------------------------------------------- */
  /*  Main Render                                                      */
  /* ---------------------------------------------------------------- */

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: 'var(--bg)',
    }}>
      {/* Header */}
      <header style={{
        padding: '0.7rem 1.5rem', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <a href="/demo" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textDecoration: 'none' }}>
            Receipt Demo
          </a>
          <div>
            <h1 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>AXL Network Demo</h1>
            <p style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>
              {phase === 'idle' ? 'Peer-to-peer receipt chain handoff via Gensyn AXL' :
                phase === 'running' ? 'Simulating sender/receiver handoff...' :
                fabricationDetected ? 'Complete -- handoff rejected' :
                'Complete -- handoff verified'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          {phase === 'running' && (
            <button disabled style={{
              padding: '0.4rem 0.9rem', borderRadius: '6px', border: 'none',
              background: 'var(--border)', color: '#fff',
              cursor: 'not-allowed', fontFamily: 'inherit',
              fontSize: '0.78rem', fontWeight: 600,
            }}>
              Running...
            </button>
          )}
          {phase === 'done' && (
            <button onClick={run} style={{
              padding: '0.4rem 0.9rem', borderRadius: '6px', border: 'none',
              background: 'var(--text)', color: '#fff',
              cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.78rem', fontWeight: 600,
            }}>
              Run Again
            </button>
          )}
        </div>
      </header>

      {/* Idle state */}
      {phase === 'idle' && renderIdle()}

      {/* Running / Done -- Three panels */}
      {phase !== 'idle' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', flex: 1, overflow: 'hidden' }}>
          {renderNodePanel('sender', senderEvents, senderReceipts, senderRef)}
          {renderNetworkBar()}
          {renderNodePanel('receiver', receiverEvents, receiverReceipts, receiverRef)}
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: '0.4rem 1.5rem', borderTop: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-dim)' }}>
          Powered by <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Gensyn AXL</span> -- A2A Protocol
        </div>
        <a href="/demo" style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-dim)', textDecoration: 'none', borderBottom: '1px dashed var(--border-dashed)' }}>
          Receipt Demo
        </a>
      </div>

      {/* Extra CSS for vertical packet animation */}
      <style>{`
        @keyframes axl-packet-vertical {
          0% { top: 0%; opacity: 0.6; }
          15% { opacity: 1; }
          50% { top: 50%; }
          85% { opacity: 1; }
          100% { top: 100%; opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
