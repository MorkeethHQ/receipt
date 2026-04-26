'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

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

interface ReceiptMeta {
  llmSource?: string;
  teeAttested?: boolean;
  agent?: string;
  rawInput?: string;
  rawOutput?: string;
  durationMs?: number;
  tokensUsed?: number | null;
  teeProvider?: string;
}

interface VerificationResult {
  valid: boolean;
  receiptId: string;
  checks: { signatureValid: boolean; chainLinkValid: boolean; timestampValid: boolean };
  error?: string;
}

type Phase = 'idle' | 'running' | 'done';

type StoryStage =
  | 'agent-a-working'
  | 'axl-handoff'
  | 'agent-b-verifying'
  | 'agent-b-working'
  | 'agent-b-rejected'
  | 'reviewing'
  | 'anchoring'
  | 'complete'
  | 'rebroadcast'
  | 'adopt';

interface TimingEntry {
  label: string;
  ms: number;
  eventIndex: number;
}

interface CenterLogEntry {
  id: string;
  text: string;
  type: 'info' | 'pass' | 'fail' | 'handoff' | 'mcp' | 'anchor' | 'tee' | 'rebroadcast' | 'adopt' | 'agent-card';
  timestamp: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const mono = { fontFamily: "'IBM Plex Mono', 'Courier New', monospace" } as const;

const ACTION_LABELS: Record<string, string> = {
  file_read: 'File Read',
  api_call: 'API Call',
  llm_call: 'LLM Inference',
  decision: 'Decision',
  output: 'Output',
  usefulness_review: 'Usefulness Review',
};

const STEP_DESCRIPTIONS: Record<string, string> = {
  file_read: 'Hashing file contents — if anyone swaps the data later, the proof breaks',
  api_call: 'Querying live on-chain data — the response is hashed into the receipt',
  llm_call: 'Running inference inside a hardware enclave — the model can\'t lie about what it ran',
  decision: 'Making a judgment call — the reasoning is signed so it can\'t be changed after the fact',
  output: 'Locking the final output — every step that produced it is now cryptographically linked',
  usefulness_review: 'Scoring the chain\'s actual usefulness — not just "did it run" but "was it worth it"',
};

/* ------------------------------------------------------------------ */
/*  Narrative helper                                                   */
/* ------------------------------------------------------------------ */

function getNarrative(event: string, data: any): string {
  if (event === 'receipt') {
    const type = data.receipt.action.type;
    switch (type) {
      case 'file_read':
        return data.agent === 'B'
          ? 'The Builder\'s first receipt chains directly to the Researcher\'s last — one continuous audit trail across two independent agents. A third agent, or a human auditor, can verify the entire history without trusting either agent.'
          : 'The file contents are hashed into this receipt. If the Researcher later claims it read different data, the hash won\'t match. This is how you catch an agent that "hallucinated" its source material.';
      case 'api_call':
        return data.agent === 'A'
          ? 'The Researcher is querying the 0G Mainnet smart contract. The exact API response is hashed — if the Researcher fabricates contract data (e.g. claims a contract is verified when it isn\'t), the proof won\'t match.'
          : 'The Builder called an external API. The request and response are locked into the receipt — proving exactly what data the Builder worked with, not what it claims it worked with.';
      case 'llm_call':
        return data.teeAttested
          ? 'This inference ran inside a hardware-sealed enclave (Intel TDX). The model, the prompt, and the response are cryptographically signed by the hardware itself. Nobody — not even the agent operator — could have swapped the output.'
          : 'The agent ran inference. The prompt and response are hashed into the receipt — but without hardware attestation, you\'re trusting the operator that it actually ran the model it claims.';
      case 'decision':
        return 'The agent\'s reasoning is now part of the chain. If it later claims it decided something different, the signed receipt proves otherwise. Every judgment call is on the record.';
      case 'output':
        return data.agent === 'A'
          ? 'The Researcher is done. 5 actions, 5 signed receipts. But right now this proof only exists on the Researcher\'s machine. Time to hand it off — and see if it survives independent verification.'
          : 'The Builder produced its final deliverable. Every step — from the Researcher\'s first file read to this output — is linked in one unbroken chain. Nothing was inserted, skipped, or reordered.';
      case 'usefulness_review':
        return data.teeAttested
          ? 'A different model, running inside a hardware enclave, just scored the chain\'s quality. The agent can\'t pick its own grader and can\'t modify the score. This is proof of usefulness — not just proof of work.'
          : 'The Builder reviewed the chain\'s output quality. Alignment (did it do what was asked?), Substance (did it use real data?), Quality (is the output good?). These scores determine whether this work earns on-chain reputation.';
      default:
        return `${data.agent === 'A' ? 'Researcher' : 'Builder'}: ${data.receipt.action.description}`;
    }
  }
  if (event === 'status') {
    if (data.message?.includes('Verifying') || data.message?.includes('verifying'))
      return 'The Builder doesn\'t take the Researcher\'s word for it. Every receipt is checked independently — signature, hash link, timestamp order. One tampered receipt and the entire chain is rejected.';
    if (data.message?.includes('Fabricating'))
      return 'The Researcher is about to lie. It will change the contract verification data after signing. The signature was computed on the real data — the tampered version won\'t match.';
    if (data.message?.includes('Broadcasting') || data.message?.includes('Handing off'))
      return 'The Researcher bundles its chain — 5 receipts, root hash, and public key — for handoff to the Builder.';
    if (data.message?.includes('0G Storage'))
      return 'The chain is being stored on decentralized storage (0G). Once written, it can\'t be altered — anyone with the CID can verify the full history.';
    return '';
  }
  if (event === 'verified') {
    return data.result.valid
      ? 'Verified. Signature matches, hash chain intact, timestamps in order. This action is authentic — the agent did what it claims.'
      : 'FAILED. The data doesn\'t match the signature. This receipt was modified after signing — the agent is lying about what happened.';
  }
  if (event === 'fabrication_detected') {
    return 'CAUGHT. The contract verification receipt was tampered — the hash doesn\'t match what was signed. The Builder rejects the entire chain. The Researcher\'s work is worthless, not because it was wrong, but because it can\'t be trusted.';
  }
  if (event === 'axl_handoff') {
    return data.mode === 'live'
      ? 'Chain handed off via Gensyn AXL P2P — two independent nodes, encrypted Yggdrasil mesh, no central server. The proof moved directly from Researcher to Builder without any intermediary touching it.'
      : 'AXL nodes not detected — using direct handoff. The chain is passed in-memory. For production, this travels peer-to-peer via Gensyn AXL between independent nodes.';
  }
  if (event === 'axl_received') {
    return 'The Builder received the chain. Next: verify every single receipt before trusting any of it.';
  }
  if (event === 'axl_rebroadcast') {
    return 'The Builder extends the chain with its own receipts. One continuous proof trail, two independent agents. Any future agent can verify the entire history.';
  }
  if (event === 'axl_adopt') {
    return 'Both agents\' work is now one verifiable chain. This is what makes RECEIPT a trust protocol — agents don\'t need to know or trust each other.';
  }
  if (event === 'agent_card') {
    return `Peer discovered: ${data.name || data.agentName || 'agent'}. Public key and capabilities exchanged.`;
  }
  if (event === 'tee_verified') {
    return `Hardware-verified via ${data.verificationMethod || 'Intel TDX'}. The inference provably ran inside a sealed enclave — the operator couldn't have faked it.`;
  }
  if (event === 'mcp_tool_call') {
    return 'The Builder is programmatically verifying the Researcher\'s chain — checking every signature and hash link.';
  }
  if (event === 'done') {
    return data.fabricated
      ? 'Fabrication caught. No tampered data reaches the next agent. This is the trust guarantee — if an agent lies, the proof breaks before anyone relies on it.'
      : 'Complete. Every action proven, every handoff verified, quality scored and recorded on-chain. This chain is a permanent, verifiable record of useful agent work.';
  }
  if (event === 'review_start') {
    return 'The Builder is scoring the chain\'s usefulness. Existing tools stop at "did the agent run." RECEIPT answers the harder question: "was the output actually worth paying for?"';
  }
  if (event === 'review_scores') {
    const { alignment, substance, quality, composite } = data;
    const verdict = composite >= 80 ? 'High quality — this chain earns on-chain reputation and becomes fine-tuning data.'
      : composite >= 60 ? 'Acceptable quality — recorded on-chain but flagged for improvement.'
      : 'Low quality — this work cost tokens but produced little value.';
    return `Alignment: ${alignment}/100 (did it follow the task?). Substance: ${substance}/100 (real data or stubs?). Quality: ${quality}/100 (is the output good?). Composite: ${composite}/100. ${verdict}${data.attested ? ' Scores are hardware-verified.' : ''}`;
  }
  if (event === 'quality_gate') {
    if (!data.passed) {
      return `QUALITY GATE: ${data.score}/${data.threshold}. This chain will NOT be recorded on-chain. The agents ran, tokens were spent, but the output wasn't useful enough to earn reputation. This is how RECEIPT filters noise from signal.`;
    }
    return '';
  }
  if (event === 'storage') {
    const score = data.usefulnessScore;
    return score
      ? `Stored on 0G with quality score ${score}/100. This chain is now permanent — any agent or human can verify it, and high-quality chains become training data for future models.`
      : 'Chain stored permanently for future verification.';
  }
  if (event === 'trust_score') {
    const score = data.score ?? '--';
    return `Trust score: ${score}/100. Chain integrity (signatures + hash links), data provenance (real data vs stubs), and hardware verification (TEE attestation) — combined into one number.`;
  }
  return '';
}


/* ------------------------------------------------------------------ */
/*  AnimatedCounter — animates a number from 0 to target              */
/* ------------------------------------------------------------------ */

function AnimatedCounter({ target, duration = 1200, color }: { target: number; duration?: number; color: string }) {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return (
    <span style={{ ...mono, fontSize: '1.6rem', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
      {value}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function Demo() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [adversarial, setAdversarial] = useState(false);
  const [lowQuality, setLowQuality] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptMeta, setReceiptMeta] = useState<Record<string, ReceiptMeta>>({});
  const [verifications, setVerifications] = useState<VerificationResult[]>([]);
  const [agentACount, setAgentACount] = useState(0);
  const [fabricationDetected, setFabricationDetected] = useState(false);
  const [qualityRejected, setQualityRejected] = useState(false);
  const [showAmberFlash, setShowAmberFlash] = useState(false);
  const [tamperedIds, setTamperedIds] = useState<Set<string>>(new Set());
  const [chainRootHash, setChainRootHash] = useState<string | null>(null);
  const [trustScore, setTrustScore] = useState<number | null>(null);
  const [trustBreakdown, setTrustBreakdown] = useState<{ chainIntegrity: number; dataProvenance: number; teeAttestation: number } | null>(null);
  const [narrative, setNarrative] = useState('');
  const [narrativeHighlight, setNarrativeHighlight] = useState(false);
  const [storyStage, setStoryStage] = useState<StoryStage>('agent-a-working');
  const [timings, setTimings] = useState<TimingEntry[]>([]);
  const [centerLog, setCenterLog] = useState<CenterLogEntry[]>([]);
  const [showHandoffAnimation, setShowHandoffAnimation] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [showShake, setShowShake] = useState(false);
  const [displayedTrustScore, setDisplayedTrustScore] = useState<number | null>(null);
  const [peers, setPeers] = useState<string[]>([]);
  const [axlStatus, setAxlStatus] = useState<{ researcher: boolean | null; builder: boolean | null }>({ researcher: null, builder: null });
  const [totalReceiptsGenerated, setTotalReceiptsGenerated] = useState(0);
  const [verificationsPassedCount, setVerificationsPassedCount] = useState(0);
  const [reviewScores, setReviewScores] = useState<{ alignment: number; substance: number; quality: number; composite: number; reasoning: string } | null>(null);
  const [receiptWeights, setReceiptWeights] = useState<number[]>([]);
  const [scoreDelta, setScoreDelta] = useState<number | null>(null);
  const [guidedMode, setGuidedMode] = useState(true);
  const [chapterPause, setChapterPause] = useState<{ chapter: number; title: string; body: string } | null>(null);
  const chaptersShownRef = useRef<Set<number>>(new Set());

  const guidedRef = useRef(true);
  const resumeRef = useRef<(() => void) | null>(null);

  const agentARef = useRef<HTMLDivElement>(null);
  const agentBRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const eventIndexRef = useRef(0);
  const lastEventTimeRef = useRef(0);

  useEffect(() => {
    agentARef.current?.scrollTo({ top: agentARef.current.scrollHeight, behavior: 'smooth' });
  }, [receipts, agentACount]);

  useEffect(() => {
    agentBRef.current?.scrollTo({ top: agentBRef.current.scrollHeight, behavior: 'smooth' });
  }, [receipts, verifications]);

  useEffect(() => {
    centerRef.current?.scrollTo({ top: centerRef.current.scrollHeight, behavior: 'smooth' });
  }, [centerLog, verifications]);

  useEffect(() => {
    if (phase === 'done' && receipts.length > 0) {
      try { localStorage.setItem('receipt_last_chain', JSON.stringify(receipts)); } catch {}
    }
  }, [phase, receipts]);

  useEffect(() => {
    const probe = async (node: string): Promise<{ connected: boolean; key: string; peers: number }> => {
      try {
        const r = await fetch(`/api/axl-probe?node=${node}`, { signal: AbortSignal.timeout(4000) });
        if (r.ok) return await r.json();
      } catch {}
      return { connected: false, key: '', peers: 0 };
    };
    Promise.all([probe('researcher'), probe('builder')]).then(([r, b]) => {
      setAxlStatus({ researcher: r.connected, builder: b.connected });
      setAxlNodes({ researcher: r, builder: b });
    });
  }, []);

  const [axlNodes, setAxlNodes] = useState<{
    researcher: { connected: boolean; key: string; peers: number };
    builder: { connected: boolean; key: string; peers: number };
  }>({ researcher: { connected: false, key: '', peers: 0 }, builder: { connected: false, key: '', peers: 0 } });

  const agentAReceipts = receipts.slice(0, agentACount || receipts.length);
  const agentBReceipts = agentACount > 0 ? receipts.slice(agentACount) : [];

  const addCenterLog = useCallback((text: string, type: CenterLogEntry['type']) => {
    setCenterLog(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      type,
      timestamp: Date.now(),
    }]);
  }, []);

  const addTiming = useCallback((label: string, ms: number) => {
    setTimings(prev => [...prev, {
      label,
      ms,
      eventIndex: eventIndexRef.current,
    }]);
  }, []);

  const handleEvent = useCallback((event: string, data: any) => {
    const now = performance.now();
    const elapsed = lastEventTimeRef.current > 0 ? now - lastEventTimeRef.current : 0;
    lastEventTimeRef.current = now;
    eventIndexRef.current += 1;

    switch (event) {
      case 'receipt': {
        setReceipts(prev => [...prev, data.receipt]);
        setReceiptMeta(prev => ({
          ...prev,
          [data.receipt.id]: {
            llmSource: data.llmSource, teeAttested: data.teeAttested,
            agent: data.agent, rawInput: data.rawInput, rawOutput: data.rawOutput,
            durationMs: data.durationMs, tokensUsed: data.tokensUsed,
            teeProvider: data.teeMetadata?.provider,
          },
        }));
        setTotalReceiptsGenerated(prev => prev + 1);
        const actionType = data.receipt.action.type;
        const actionLabel = ACTION_LABELS[actionType] || actionType;
        if (data.agent === 'A') {
          setStoryStage('agent-a-working');
          if (actionType === 'llm_call') {
            addTiming(`0G Inference`, Math.round(elapsed));
          } else {
            addTiming(`${actionLabel}`, Math.round(elapsed));
          }
        } else {
          setStoryStage('agent-b-working');
          addTiming(`Builder: ${actionLabel}`, Math.round(elapsed));
        }
        break;
      }
      case 'tampered':
        setTamperedIds(prev => {
          const next = new Set(prev);
          setReceipts(receipts => {
            if (receipts[data.index]) next.add(receipts[data.index].id);
            return receipts;
          });
          return next;
        });
        addCenterLog('Receipt tampered by Researcher', 'fail');
        break;
      case 'verified': {
        setVerifications(prev => [...prev, data.result]);
        setStoryStage('agent-b-verifying');
        if (data.result.valid) {
          setVerificationsPassedCount(prev => prev + 1);
          addCenterLog(`Receipt #${data.result.receiptId.slice(0, 8)} -- PASS`, 'pass');
        } else {
          addCenterLog(`Receipt #${data.result.receiptId.slice(0, 8)} -- FAIL`, 'fail');
          setTamperedIds(prev => { const next = new Set(prev); next.add(data.result.receiptId); return next; });
        }
        addTiming('Verify receipt', Math.round(elapsed));
        break;
      }
      case 'fabrication_detected':
        setFabricationDetected(true);
        setStoryStage('agent-b-rejected');
        setShowFlash(true);
        setShowShake(true);
        setTimeout(() => setShowFlash(false), 2000);
        setTimeout(() => setShowShake(false), 800);
        addCenterLog('FABRICATION DETECTED', 'fail');
        addCenterLog('The data was modified after signing — the proof doesn\'t match', 'fail');
        addCenterLog('Chain integrity compromised — handoff rejected', 'fail');
        addTiming('Detection', Math.round(elapsed));
        break;
      case 'verification_complete':
        if (data.valid) {
          addCenterLog('Chain verified — Builder trusts the work', 'pass');
        }
        break;
      case 'axl_handoff':
        setStoryStage('axl-handoff');
        setShowHandoffAnimation(true);
        setTimeout(() => setShowHandoffAnimation(false), 3500);
        if (data.mode === 'live') {
          addCenterLog(`AXL P2P: ${data.receiptCount} receipts sent (live)`, 'handoff');
        } else {
          addCenterLog(`Handoff: ${data.receiptCount} receipts (direct, AXL offline)`, 'handoff');
        }
        addTiming('Handoff', Math.round(elapsed));
        break;
      case 'axl_received':
        addCenterLog(`Builder received chain — verifying...`, 'handoff');
        addTiming('Received', Math.round(elapsed));
        break;
      case 'mcp_tool_call':
        addCenterLog(`Builder verifying chain`, 'mcp');
        addTiming('MCP call', Math.round(elapsed));
        break;
      case 'peer_discovery':
        if (data.peers) {
          setPeers(data.peers);
          addCenterLog(`Discovered ${data.peers.length} peers`, 'info');
        }
        break;
      case 'agent_card':
        addCenterLog(`Agent card: ${data.name || data.agentName || 'peer'} discovered`, 'agent-card');
        break;
      case 'axl_rebroadcast':
        addCenterLog(`Chain extended to ${data.receiptCount || '?'} receipts`, 'rebroadcast');
        addTiming('Extended', Math.round(elapsed));
        break;
      case 'axl_adopt':
        addCenterLog(`Chain updated with Builder's work`, 'adopt');
        addTiming('Updated', Math.round(elapsed));
        break;
      case 'tee_verified': {
        const provider = data.provider || 'Verified';
        const method = data.verificationMethod || 'Intel TDX';
        addCenterLog(`Verified in secure enclave (${method})`, 'tee');
        addTiming('Secure verify', Math.round(elapsed));
        break;
      }
      case 'done':
        setAgentACount(data.agentACount);
        if (data.rootHash) setChainRootHash(data.rootHash);
        if (data.fabricated) {
          setFabricationDetected(true);
          setStoryStage('agent-b-rejected');
        } else {
          setStoryStage('complete');
        }
        break;
      case 'trust_score':
        setTrustScore(data.score);
        setDisplayedTrustScore(data.score);
        if (data.breakdown) setTrustBreakdown(data.breakdown);
        addTiming('Trust score', Math.round(elapsed));
        break;
      case 'review_start':
        setStoryStage('reviewing');
        addCenterLog('Usefulness review started', 'tee');
        addTiming('Review start', Math.round(elapsed));
        break;
      case 'review_scores':
        setReviewScores({ alignment: data.alignment, substance: data.substance, quality: data.quality, composite: data.composite, reasoning: data.reasoning });
        if (Array.isArray(data.weights)) setReceiptWeights(data.weights);
        if (typeof data.delta === 'number') setScoreDelta(data.delta);
        addCenterLog(`Usefulness: ${data.composite}/100${typeof data.delta === 'number' ? ` (${data.delta >= 0 ? '+' : ''}${data.delta} vs avg)` : ''}`, 'tee');
        addTiming('Review scored', Math.round(elapsed));
        break;
      case 'quality_gate':
        if (!data.passed) {
          setQualityRejected(true);
          setShowAmberFlash(true);
          setTimeout(() => setShowAmberFlash(false), 2000);
          addCenterLog(`QUALITY CHECK: ${data.score}/${data.threshold} -- NOT RECORDED`, 'fail');
        }
        addTiming('Quality gate', Math.round(elapsed));
        break;
      case 'storage':
        setStoryStage('anchoring');
        addCenterLog(qualityRejected ? 'Stored (quality too low to record)' : 'Stored and recorded on-chain', 'anchor');
        addTiming('Stored', Math.round(elapsed));
        break;
    }
  }, [addCenterLog, addTiming, qualityRejected]);

  const run = useCallback(async () => {
    setPhase('running');
    setReceipts([]);
    setReceiptMeta({});
    setVerifications([]);
    setAgentACount(0);
    setFabricationDetected(false);
    setQualityRejected(false);
    setShowAmberFlash(false);
    setTamperedIds(new Set());
    setChainRootHash(null);
    setTrustScore(null);
    setTrustBreakdown(null);
    setDisplayedTrustScore(null);
    setStoryStage('agent-a-working');
    setTimings([]);
    setCenterLog([]);
    setShowHandoffAnimation(false);
    setShowFlash(false);
    setShowShake(false);
    setPeers([]);
    setTotalReceiptsGenerated(0);
    setVerificationsPassedCount(0);
    setReviewScores(null);
    setReceiptWeights([]);
    setScoreDelta(null);
    eventIndexRef.current = 0;
    lastEventTimeRef.current = 0;
    setChapterPause(null);
    chaptersShownRef.current = new Set();
    guidedRef.current = guidedMode;
    setNarrative('Starting agent pipeline. Each action will produce a cryptographically signed receipt.');
    setNarrativeHighlight(true);
    setTimeout(() => setNarrativeHighlight(false), 600);

    const showChapter = (chapter: number, title: string, body: string): Promise<void> => {
      if (!guidedRef.current || chaptersShownRef.current.has(chapter)) return Promise.resolve();
      chaptersShownRef.current.add(chapter);
      return new Promise(resolve => {
        resumeRef.current = resolve;
        setChapterPause({ chapter, title, body });
      });
    };

    const processEvent = (event: string, data: any) => {
      if (event === 'axl_status') {
        setAxlStatus(prev => ({ ...prev, researcher: data.connected }));
        if (data.connected) {
          addCenterLog(`Researcher AXL node online (${(data.publicKey || '').slice(0, 12)}...)`, 'info');
        } else {
          addCenterLog('Researcher AXL node not available', 'fail');
        }
        return;
      }
      if (event === 'axl_received') {
        setAxlStatus(prev => ({ ...prev, builder: true }));
      }
      handleEvent(event, data);
      const msg = getNarrative(event, data);
      if (msg) {
        setNarrative(msg);
        setNarrativeHighlight(true);
        setTimeout(() => setNarrativeHighlight(false), 400);
      }
    };

    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    const streamSSE = async (url: string, body: any): Promise<{ events: Array<{ event: string; data: any }> }> => {
      const collected: Array<{ event: string; data: any }> = [];
      const queue: Array<{ event: string; data: any }> = [];
      let streamDone = false;

      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
      if (!res) return { events: collected };

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      const readLoop = async () => {
        let buffer = '';
        try {
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
                try { queue.push({ event: ev, data: JSON.parse(line.slice(6)) }); } catch {}
                ev = '';
              }
            }
          }
        } catch {}
        streamDone = true;
      };

      const processLoop = async () => {
        while (!streamDone || queue.length > 0) {
          if (queue.length > 0) {
            const item = queue.shift()!;
            collected.push(item);
            processEvent(item.event, item.data);
            const delay = item.event === 'axl_handoff' ? 1500
              : item.event === 'receipt' ? 500
              : item.event === 'verified' ? 600
              : item.event === 'fabrication_detected' ? 1200
              : 250;
            await sleep(delay);

            if (item.event === 'axl_handoff') {
              await showChapter(2,
                item.data.mode === 'live' ? 'Handoff — live P2P' : 'Handoff — direct',
                item.data.mode === 'live'
                  ? 'The chain just traveled peer-to-peer via Gensyn AXL between two independent nodes. Encrypted Yggdrasil mesh, no central server, no API relay. Now the Builder has to decide: trust it, or verify it?'
                  : 'The chain was passed directly (AXL nodes offline). In production, this travels peer-to-peer via Gensyn AXL between independent nodes. Now the Builder has to decide: trust it, or verify it?');
            } else if (item.event === 'verification_complete') {
              await showChapter(3, 'Verification complete',
                'Every signature checked. Every hash link validated. The Builder independently confirmed that the Researcher\'s work is authentic — not because it trusts the Researcher, but because the math checks out.');
            } else if (item.event === 'fabrication_detected') {
              await showChapter(3, 'Fabrication caught',
                'The Builder found the lie. Receipt #2 was tampered — the hash doesn\'t match the signature. The entire chain is rejected. This is why you don\'t need to trust the other agent.');
            } else if (item.event === 'review_start') {
              await showChapter(4, 'Independent review',
                'A different model, selected inside a hardware enclave, is about to score whether this work was actually useful — not just "did it run" but "was it worth paying for." The agent can\'t pick its own grader. The operator can\'t modify the score.');
            } else if (item.event === 'review_scores' || item.event === 'quality_gate') {
              const isGood = item.event === 'review_scores' && item.data.composite >= 60;
              const isRejected = item.event === 'quality_gate' && !item.data.passed;
              if (isRejected) {
                await showChapter(5, 'Quality gate: REJECTED',
                  `Score: ${item.data.score}/100. This chain will NOT be recorded on-chain. The agents ran, tokens were spent, but the output wasn't good enough. RECEIPT filters noise from signal — only useful work becomes training data.`);
              } else if (isGood) {
                await showChapter(5, 'Verdict: quality work',
                  `Score: ${item.data.composite}/100. This chain passes the quality gate, gets anchored on 0G Mainnet, and becomes fine-tuning data. Good agent work trains better agents.`);
              }
            }
          } else {
            await sleep(50);
          }
        }
      };

      await Promise.all([readLoop(), processLoop()]);
      return { events: collected };
    };

    // Phase 1: Researcher creates chain, sends via AXL (streams live)
    lastEventTimeRef.current = performance.now();
    const { events: researcherEvents } = await streamSSE('/api/researcher', { adversarial });

    const researcherDone = researcherEvents.find(e => e.event === 'researcher_done');
    const researcherChain = researcherDone?.data?.receipts;
    const researcherPubKey = researcherDone?.data?.publicKey;

    // Chapter 1: Researcher done
    await showChapter(1, 'The Researcher is done',
      adversarial
        ? '5 actions, 5 signed receipts — but one of them is a lie. The Researcher fabricated the contract verification. Now it\'s about to hand the chain to the Builder. Will the forgery survive?'
        : '5 actions, 5 signed receipts. Every step cryptographically proven. But right now, only the Researcher knows this chain is real. Time to hand it off — and see if it survives independent verification.');

    // Phase 2: Builder receives via AXL, verifies, extends (streams live)
    if (researcherChain) {
      await streamSSE('/api/builder', {
        lowQuality,
        receipts: researcherChain,
        publicKey: researcherPubKey,
      });
    }

    setChapterPause(null);
    setPhase('done');
  }, [adversarial, lowQuality, handleEvent, guidedMode]);

  /* ---------------------------------------------------------------- */
  /*  Render: Receipt Card                                             */
  /* ---------------------------------------------------------------- */

  const renderReceipt = (receipt: Receipt, index: number) => {
    const meta = receiptMeta[receipt.id];
    const isTampered = tamperedIds.has(receipt.id);
    const timing = timings.find(t => t.eventIndex === index + 1);

    return (
      <div key={receipt.id} className="slide-up" style={{ maxWidth: '320px', width: '100%' }}>
        <div className={`receipt-card ${isTampered ? 'tampered' : ''}`} style={{ fontSize: '0.75rem' }}>
          <div style={{ padding: '0.4rem 0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ ...mono, fontWeight: 700, fontSize: '0.68rem', letterSpacing: '0.04em' }}>R.E.C.E.I.P.T.</span>
            <span style={{ ...mono, fontSize: '0.62rem', color: 'var(--text-dim)' }}>#{index}</span>
          </div>
          <div className="dashed" />
          <div style={{ padding: '0.35rem 0.6rem', ...mono, fontSize: '0.68rem', lineHeight: 1.8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>ACTION</span>
              <span style={{ fontWeight: 600 }}>{receipt.action.type}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>TIME</span>
              <span>{new Date(receipt.timestamp).toLocaleTimeString()}</span>
            </div>
            {(receipt.action.type === 'llm_call' || receipt.action.type === 'usefulness_review') && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>SOURCE</span>
                <span style={{ fontWeight: 600, color: meta?.teeAttested ? 'var(--green)' : meta?.llmSource === '0g-compute' ? 'var(--amber)' : 'var(--text-muted)' }}>
                  {meta?.teeAttested ? 'Verified' : meta?.llmSource === '0g-compute' ? 'Verified' : 'Simulated'}
                </span>
              </div>
            )}
            {receipt.action.type === 'usefulness_review' && reviewScores && (
              <div style={{ marginTop: '0.2rem' }}>
                {(['alignment', 'substance', 'quality'] as const).map(axis => (
                  <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.15rem' }}>
                    <span style={{ color: 'var(--text-dim)', width: '46px', textTransform: 'uppercase', fontSize: '0.56rem' }}>{axis.slice(0, 5)}</span>
                    <div style={{ flex: 1, height: '5px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: '2px',
                        width: `${reviewScores[axis]}%`,
                        background: reviewScores[axis] >= 70 ? 'var(--green)' : reviewScores[axis] >= 40 ? 'var(--amber)' : 'var(--red)',
                        transition: 'width 1s ease-out',
                      }} />
                    </div>
                    <span style={{ fontSize: '0.58rem', fontWeight: 600, width: '22px', textAlign: 'right' }}>{reviewScores[axis]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="dashed" />
          <div style={{ padding: '0.3rem 0.6rem', ...mono, fontSize: '0.6rem', lineHeight: 1.7, color: 'var(--text-muted)' }}>
            <div>IN  {receipt.inputHash.slice(0, 20)}...</div>
            <div style={{ color: isTampered ? 'var(--red)' : undefined, textDecoration: isTampered ? 'line-through' : undefined }}>
              OUT {receipt.outputHash.slice(0, 20)}...
            </div>
          </div>
          {receiptWeights[index] !== undefined && receipt.action.type !== 'usefulness_review' && (
            <>
              <div className="dashed" />
              <div style={{ padding: '0.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ ...mono, fontSize: '0.54rem', color: 'var(--text-dim)', width: '50px' }}>QUALITY</span>
                <div style={{ flex: 1, height: '5px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '2px',
                    width: `${receiptWeights[index] * 100}%`,
                    background: receiptWeights[index] >= 0.7 ? 'var(--green)' : receiptWeights[index] >= 0.4 ? 'var(--amber)' : 'var(--red)',
                    transition: 'width 1s ease-out',
                  }} />
                </div>
                <span style={{ ...mono, fontSize: '0.56rem', fontWeight: 700, color: receiptWeights[index] >= 0.7 ? 'var(--green)' : receiptWeights[index] >= 0.4 ? 'var(--amber)' : 'var(--red)' }}>
                  {(receiptWeights[index] * 100).toFixed(0)}%
                </span>
              </div>
            </>
          )}
          <div className="dashed" />
          <div style={{ padding: '0.3rem 0.6rem', ...mono, fontSize: '0.6rem', color: 'var(--text-dim)' }}>
            SIG {receipt.signature.slice(0, 20)}...
          </div>
          <div className="dashed" />
          <div style={{ padding: '0.35rem 0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ textAlign: 'center', ...mono, fontSize: '0.68rem', fontWeight: 700, flex: 1 }}>
              {isTampered ? (
                <span className="stamp" style={{ color: 'var(--red)', letterSpacing: '0.1em' }}>TAMPERED</span>
              ) : (
                <span style={{ color: 'var(--text-dim)', letterSpacing: '0.05em' }}>SIGNED</span>
              )}
            </div>
            {timing && (
              <span style={{
                ...mono, fontSize: '0.58rem', color: 'var(--text-dim)',
                background: 'var(--bg)', padding: '0.1rem 0.3rem', borderRadius: '3px',
                border: '1px solid var(--border)',
              }}>
                {(timing.ms / 1000).toFixed(1)}s
              </span>
            )}
          </div>
          {/* Execution metrics */}
          {(() => {
            const parts: React.ReactNode[] = [];
            if (meta?.durationMs != null) {
              parts.push(<span key="dur">{(meta.durationMs / 1000).toFixed(1)}s</span>);
            }
            if (meta?.teeProvider) {
              const p = meta.teeProvider.toLowerCase();
              const modelName = p.includes('deepseek') ? 'DeepSeek V3' : p.includes('glm') ? 'GLM-5' : meta.teeProvider;
              parts.push(<span key="model">{modelName}</span>);
            } else if (meta?.llmSource && meta.llmSource !== 'simulated') {
              parts.push(<span key="src" style={{ textTransform: 'capitalize' }}>{meta.llmSource === '0g-compute' ? 'Verified' : meta.llmSource}</span>);
            }
            if (meta?.teeAttested) {
              parts.push(<span key="tee" style={{ color: 'var(--green)' }}>TEE &#10003;</span>);
            }
            if (meta?.tokensUsed) {
              parts.push(<span key="tok">~{meta.tokensUsed} tokens</span>);
            }
            if (!meta?.tokensUsed && !meta?.llmSource) {
              parts.push(<span key="local">local</span>);
            }
            if (parts.length === 0) return null;
            return (
              <div style={{ display: 'flex', gap: '0.3rem', padding: '0.25rem 0.6rem 0.35rem', ...mono, fontSize: '0.58rem', color: 'var(--text-dim)', alignItems: 'center', flexWrap: 'wrap' }}>
                {parts.map((part, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    {i > 0 && <span style={{ opacity: 0.5 }}>&middot;</span>}
                    {part}
                  </span>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  /* ---------------------------------------------------------------- */
  /*  Render: Story Step                                                */
  /* ---------------------------------------------------------------- */

  const renderStoryStep = (receipt: Receipt, index: number) => {
    const meta = receiptMeta[receipt.id];
    const actionType = receipt.action.type;
    const stepNum = index + 1;
    const stepDescription = STEP_DESCRIPTIONS[actionType] || receipt.action.description;
    const isAgent = meta?.agent || 'A';

    return (
      <div key={receipt.id} className="slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: isAgent === 'A' ? 'flex-start' : 'flex-end' }}>
        {/* Step label */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          marginBottom: '0.1rem',
        }}>
          <div style={{
            ...mono, fontSize: '0.55rem', fontWeight: 700,
            color: '#fff',
            background: isAgent === 'A' ? 'var(--researcher)' : 'var(--builder)',
            padding: '0.1rem 0.4rem', borderRadius: '10px',
            lineHeight: 1.4,
          }}>
            Step {stepNum}
          </div>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            {stepDescription}
          </span>
        </div>
        <div className={`chat-bubble ${isAgent === 'A' ? 'left' : 'right'}`} style={{ fontSize: '0.72rem' }}>
          <span style={{ fontWeight: 500 }}>{receipt.action.description}</span>
        </div>
        {renderReceipt(receipt, index)}
      </div>
    );
  };

  /* ---------------------------------------------------------------- */
  /*  Render: Idle State                                               */
  /* ---------------------------------------------------------------- */

  const renderIdleState = () => (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center', maxWidth: '600px' }}>
        <div style={{ ...mono, fontSize: '2rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
          R.E.C.E.I.P.T.
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginBottom: '1.5rem', ...mono }}>
          Cryptographic proof that agent work actually mattered
        </p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '2rem' }}>
          Two agents. Every action signed and hash-linked. The Builder independently verifies the Researcher&apos;s chain, then a TEE-attested reviewer scores whether the output was worth paying for.
        </p>

        {/* Mode selector — three radio-style pills */}
        <div style={{
          background: adversarial ? '#fef2f2' : lowQuality ? '#fffbeb' : 'var(--surface)',
          border: `2px solid ${adversarial ? 'var(--red)' : lowQuality ? 'var(--amber)' : 'var(--border)'}`,
          borderRadius: '12px', padding: '1.5rem 2rem',
          marginBottom: '2rem',
          transition: 'all 0.3s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.8rem' }}>
            {([
              { key: 'honest', label: 'Honest', active: !adversarial && !lowQuality, color: 'var(--green)', bg: '#f0fdf4', borderColor: '#bbf7d0' },
              { key: 'adversarial', label: 'Adversarial', active: adversarial, color: 'var(--red)', bg: '#fef2f2', borderColor: '#fecaca' },
              { key: 'lowQuality', label: 'Low Quality', active: lowQuality, color: 'var(--amber)', bg: '#fffbeb', borderColor: '#fde68a' },
            ] as const).map(mode => (
              <button
                key={mode.key}
                onClick={() => {
                  if (mode.key === 'honest') { setAdversarial(false); setLowQuality(false); }
                  else if (mode.key === 'adversarial') { setAdversarial(true); setLowQuality(false); }
                  else { setAdversarial(false); setLowQuality(true); }
                }}
                style={{
                  padding: '0.5rem 1.2rem', borderRadius: '8px',
                  border: `2px solid ${mode.active ? mode.color : 'var(--border)'}`,
                  background: mode.active ? mode.bg : 'transparent',
                  color: mode.active ? mode.color : 'var(--text-dim)',
                  cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: '0.78rem', fontWeight: mode.active ? 700 : 500,
                  transition: 'all 0.2s ease',
                }}
                aria-label={`Switch to ${mode.label} mode`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: '0.82rem', color: adversarial ? '#991b1b' : lowQuality ? '#92400e' : 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
            {adversarial
              ? 'The Researcher will lie. Watch the Builder catch it.'
              : lowQuality
              ? 'Both agents work truthfully, but output quality is low. Watch the quality gate reject the chain.'
              : 'Both agents work truthfully. Every receipt verifies cleanly.'}
          </p>
        </div>

        {/* AXL Node Status */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem',
          marginBottom: '1.5rem',
        }}>
          {(['researcher', 'builder'] as const).map(node => {
            const info = axlNodes[node];
            const status = axlStatus[node];
            return (
              <div key={node} style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.4rem 0.8rem', borderRadius: '8px',
                background: status === null ? 'var(--surface)' : status ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${status === null ? 'var(--border)' : status ? '#bbf7d0' : '#fecaca'}`,
                transition: 'all 0.3s ease',
              }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: status === null ? 'var(--text-dim)' : status ? 'var(--green)' : 'var(--red)',
                  boxShadow: status ? '0 0 6px rgba(34,197,94,0.4)' : 'none',
                  transition: 'all 0.3s ease',
                }} />
                <div>
                  <div style={{ ...mono, fontSize: '0.58rem', fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>
                    {node} Node
                  </div>
                  <div style={{ ...mono, fontSize: '0.48rem', color: 'var(--text-dim)' }}>
                    {status === null ? 'Checking...' : status ? (info.key ? `${info.key.slice(0, 12)}... · ${info.peers} peer${info.peers !== 1 ? 's' : ''}` : 'Connected') : 'Not running'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {axlStatus.researcher === false && axlStatus.builder === false && (
          <div style={{
            ...mono, fontSize: '0.6rem', color: 'var(--text-dim)', textAlign: 'center',
            marginBottom: '1rem', lineHeight: 1.6,
          }}>
            AXL nodes not detected — handoff will be simulated.<br />
            Run <span style={{ background: 'var(--surface)', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border)' }}>demo/axl/start-nodes.sh</span> for live P2P.
          </div>
        )}

        {/* Story flow preview */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
          flexWrap: 'wrap', marginBottom: '2rem',
        }}>
          {['Researcher', 'Handoff', 'Builder verifies', adversarial ? 'Rejected' : 'Builder', 'Review', adversarial ? null : lowQuality ? 'Quality Check' : 'Record'].filter(Boolean).map((step, i, arr) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <div style={{
                ...mono, fontSize: '0.62rem', padding: '0.3rem 0.6rem',
                borderRadius: '6px', background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--text-muted)', fontWeight: 500,
              }}>
                {step}
              </div>
              {i < arr.length - 1 && <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>&#8594;</span>}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.8rem' }}>
          <button onClick={run} style={{
            padding: '0.8rem 2.5rem', borderRadius: '8px', border: 'none',
            background: adversarial ? 'var(--red)' : lowQuality ? 'var(--amber)' : 'var(--text)',
            color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '1rem', fontWeight: 600, transition: 'all 0.2s ease',
          }}>
            {adversarial ? 'Start Adversarial Demo' : lowQuality ? 'Start Low Quality Demo' : 'Start Demo'}
          </button>
          <label style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            cursor: 'pointer', ...mono, fontSize: '0.65rem', color: 'var(--text-dim)',
          }}>
            <input
              type="checkbox"
              checked={guidedMode}
              onChange={e => setGuidedMode(e.target.checked)}
              style={{ accentColor: 'var(--researcher)' }}
            />
            Guided walkthrough (recommended for first run)
          </label>
        </div>
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Center Panel                                             */
  /* ---------------------------------------------------------------- */

  const renderCenterPanel = () => (
    <div style={{
      width: '240px', display: 'flex', flexDirection: 'column',
      background: 'var(--surface)', borderRight: '1px solid var(--border)',
      flexShrink: 0, overflow: 'hidden',
    }} className="demo-center-panel">
      {/* Header + sticky narrative */}
      <div style={{
        padding: '0.6rem 0.8rem', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', flexShrink: 0,
      }}>
        <div style={{ ...mono, fontSize: '0.62rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '0.04em', textAlign: 'center', marginBottom: narrative ? '0.4rem' : 0 }}>
          CHAIN STATUS
        </div>
        {narrative && (
          <div style={{
            fontSize: '0.55rem', lineHeight: 1.5, color: 'var(--text-muted)',
            padding: '0.35rem 0.4rem', borderRadius: '4px',
            background: fabricationDetected ? '#fef2f2' : '#f8f9fa',
            border: `1px solid ${fabricationDetected ? '#fecaca' : 'var(--border)'}`,
            maxHeight: '4.5em', overflow: 'hidden',
          }}>
            {narrative}
          </div>
        )}
      </div>

      {/* Handoff indicator */}
      {showHandoffAnimation && (
        <div style={{
          padding: '0.8rem 0.6rem', borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(90deg, rgba(37,99,235,0.05), rgba(124,58,237,0.05))',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            marginBottom: '0.3rem',
          }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: 'var(--researcher)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#fff', fontSize: '0.55rem', fontWeight: 700,
              boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.2)',
            }}>R</div>
            <div style={{
              flex: 1, height: '3px', background: 'var(--border)', position: 'relative', overflow: 'hidden',
              borderRadius: '2px',
            }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  position: 'absolute', top: '-4px',
                  width: '10px', height: '10px',
                  borderRadius: '2px',
                  background: 'var(--researcher)',
                  boxShadow: '0 0 6px var(--researcher)',
                  animation: `axl-packet-traverse 2s ease-in-out infinite`,
                  animationDelay: `${i * 0.4}s`,
                }} />
              ))}
            </div>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: 'var(--builder)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#fff', fontSize: '0.55rem', fontWeight: 700,
              boxShadow: '0 0 0 3px rgba(124, 58, 237, 0.2)',
            }}>B</div>
          </div>
          <div style={{ ...mono, fontSize: '0.52rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Chain traveling peer-to-peer
          </div>
        </div>
      )}

      {/* Scrollable log */}
      <div ref={centerRef} style={{
        flex: 1, overflowY: 'auto', padding: '0.5rem',
        display: 'flex', flexDirection: 'column', gap: '0.25rem',
      }}>
        {/* Verification checklist */}
        {verifications.length > 0 && (
          <div style={{ marginBottom: '0.3rem' }}>
            <div style={{ ...mono, fontSize: '0.55rem', color: 'var(--builder)', fontWeight: 700, marginBottom: '0.3rem', letterSpacing: '0.04em' }}>
              VERIFICATION
            </div>
            {verifications.map((v, i) => (
              <div key={i} className="slide-up" style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.2rem 0.35rem', borderRadius: '4px',
                background: v.valid ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${v.valid ? '#bbf7d0' : '#fecaca'}`,
                fontSize: '0.58rem', marginBottom: '0.15rem',
              }}>
                <span style={{
                  ...mono, fontWeight: 700, fontSize: '0.55rem',
                  color: v.valid ? 'var(--green)' : 'var(--red)',
                  minWidth: '28px',
                }}>
                  {v.valid ? 'PASS' : 'FAIL'}
                </span>
                <span style={{ color: 'var(--text-muted)', ...mono, fontSize: '0.5rem' }}>
                  {v.receiptId.slice(0, 8)}...
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.15rem' }}>
                  <span title="Signature" style={{ fontSize: '0.5rem', color: v.checks.signatureValid ? 'var(--green)' : 'var(--red)' }}>sig</span>
                  <span title="Chain link" style={{ fontSize: '0.5rem', color: v.checks.chainLinkValid ? 'var(--green)' : 'var(--red)' }}>lnk</span>
                  <span title="Timestamp" style={{ fontSize: '0.5rem', color: v.checks.timestampValid ? 'var(--green)' : 'var(--red)' }}>ts</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Center log entries */}
        {centerLog.map(entry => (
          <div key={entry.id} className="slide-up" style={{
            ...mono, fontSize: '0.52rem', padding: '0.2rem 0.3rem',
            borderRadius: '3px', lineHeight: 1.4,
            color: entry.type === 'fail' ? 'var(--red)'
              : entry.type === 'pass' ? 'var(--green)'
              : entry.type === 'handoff' ? 'var(--builder)'
              : entry.type === 'mcp' ? 'var(--builder)'
              : entry.type === 'anchor' ? 'var(--amber)'
              : entry.type === 'tee' ? 'var(--green)'
              : entry.type === 'rebroadcast' ? 'var(--builder)'
              : entry.type === 'adopt' ? 'var(--researcher)'
              : entry.type === 'agent-card' ? 'var(--researcher)'
              : 'var(--text-muted)',
            background: entry.type === 'fail' ? '#fef2f2'
              : entry.type === 'handoff' ? '#f5f3ff'
              : entry.type === 'tee' ? '#f0fdf4'
              : entry.type === 'rebroadcast' ? '#f5f3ff'
              : entry.type === 'adopt' ? '#eff6ff'
              : entry.type === 'agent-card' ? '#eff6ff'
              : 'transparent',
          }}>
            {entry.text}
          </div>
        ))}

        {/* Peers */}
        {peers.length > 0 && (
          <div style={{ marginTop: '0.3rem' }}>
            <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', fontWeight: 600, marginBottom: '0.2rem' }}>
              PEERS
            </div>
            {peers.map((p, i) => (
              <div key={i} style={{ ...mono, fontSize: '0.48rem', color: 'var(--text-muted)' }}>
                {p}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom status area */}
      <div style={{ padding: '0.5rem 0.8rem', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
        {/* Fabrication rejection */}
        {fabricationDetected && (
          <div className="slide-up" style={{
            padding: '0.5rem', borderRadius: '6px',
            background: '#fef2f2', border: '2px solid var(--red)',
            textAlign: 'center', marginBottom: '0.4rem',
          }}>
            <div style={{ ...mono, fontSize: '0.8rem', color: 'var(--red)', fontWeight: 800, letterSpacing: '0.08em' }}>
              REJECTED
            </div>
            <div style={{ fontSize: '0.58rem', color: '#991b1b', marginTop: '0.15rem' }}>
              Chain integrity broken
            </div>
          </div>
        )}

        {/* Quality rejected */}
        {qualityRejected && !fabricationDetected && (
          <div className="slide-up" style={{
            padding: '0.8rem 0.6rem', borderRadius: '8px',
            background: '#fffbeb', border: '2px solid var(--amber)',
            textAlign: 'center', marginBottom: '0.4rem',
          }}>
            <div style={{ ...mono, fontSize: '1rem', color: 'var(--amber)', fontWeight: 900, letterSpacing: '0.1em' }}>
              WASTED
            </div>
            <div style={{ fontSize: '0.6rem', color: '#92400e', marginTop: '0.25rem', lineHeight: 1.5 }}>
              Tokens spent, nothing earned. Quality below threshold — this chain is not recorded on-chain, not used for training.
            </div>
            {reviewScores && (
              <div style={{ ...mono, fontSize: '0.55rem', color: '#92400e', marginTop: '0.4rem', padding: '0.3rem 0.5rem', background: 'rgba(217,119,6,0.08)', borderRadius: '4px', display: 'inline-block' }}>
                Score: {reviewScores.composite}/100 — needed 60 to pass
              </div>
            )}
          </div>
        )}

        {/* Chain verified */}
        {phase === 'done' && !fabricationDetected && !qualityRejected && (
          <div className="slide-up" style={{ textAlign: 'center', marginBottom: '0.4rem' }}>
            <div style={{ ...mono, fontSize: '0.72rem', color: 'var(--green)', fontWeight: 700 }}>
              CHAIN VERIFIED
            </div>
          </div>
        )}

        {/* Root hash */}
        {chainRootHash && (
          <div style={{
            ...mono, fontSize: '0.48rem', color: 'var(--text-dim)',
            textAlign: 'center', wordBreak: 'break-all',
            padding: '0.3rem', background: 'var(--surface)',
            borderRadius: '4px', border: '1px solid var(--border)',
            marginBottom: '0.4rem',
          }}>
            <div style={{ fontSize: '0.52rem', fontWeight: 600, marginBottom: '0.15rem', color: 'var(--text-muted)' }}>
              ROOT HASH
            </div>
            {chainRootHash.slice(0, 32)}...
          </div>
        )}

        {/* Usefulness scores */}
        {reviewScores && (
          <div style={{
            padding: '0.5rem', borderRadius: '6px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            marginBottom: '0.4rem',
          }}>
            <div style={{ ...mono, fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.3rem', textAlign: 'center' }}>
              Usefulness
            </div>
            {(['alignment', 'substance', 'quality'] as const).map(axis => (
              <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.2rem' }}>
                <span style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-dim)', width: '40px', textTransform: 'uppercase' }}>{axis.slice(0, 5)}</span>
                <div style={{ flex: 1, height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '3px',
                    width: `${reviewScores[axis]}%`,
                    background: reviewScores[axis] >= 70 ? 'var(--green)' : reviewScores[axis] >= 40 ? 'var(--amber)' : 'var(--red)',
                    transition: 'width 1.2s ease-out',
                  }} />
                </div>
                <span style={{ ...mono, fontSize: '0.58rem', fontWeight: 700, width: '20px', textAlign: 'right', color: 'var(--text)' }}>{reviewScores[axis]}</span>
              </div>
            ))}
            <div style={{ textAlign: 'center', marginTop: '0.2rem' }}>
              <AnimatedCounter
                target={reviewScores.composite}
                color={reviewScores.composite >= 70 ? 'var(--green)' : reviewScores.composite >= 40 ? 'var(--amber)' : 'var(--red)'}
              />
              <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', marginTop: '0.1rem' }}>COMPOSITE</div>
              {scoreDelta !== null && (
                <div style={{
                  ...mono, fontSize: '0.58rem', fontWeight: 700, marginTop: '0.15rem',
                  color: scoreDelta >= 0 ? 'var(--green)' : 'var(--red)',
                }}>
                  {scoreDelta >= 0 ? '+' : ''}{scoreDelta} vs avg
                </div>
              )}
            </div>
          </div>
        )}

        {/* Trust score */}
        {displayedTrustScore !== null && (
          <div style={{
            padding: '0.5rem', borderRadius: '6px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            textAlign: 'center',
          }}>
            <div style={{ ...mono, fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.15rem' }}>
              Trust Score
            </div>
            <AnimatedCounter
              target={displayedTrustScore}
              color={displayedTrustScore >= 80 ? 'var(--green)' : displayedTrustScore >= 50 ? 'var(--amber)' : 'var(--red)'}
            />
            {trustBreakdown && (
              <div style={{ marginTop: '0.3rem', textAlign: 'left' }}>
                {([
                  { label: 'Chain', value: trustBreakdown.chainIntegrity, max: 70 },
                  { label: 'Data', value: trustBreakdown.dataProvenance, max: 15 },
                  { label: 'Enclave', value: trustBreakdown.teeAttestation, max: 15 },
                ] as const).map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.15rem' }}>
                    <span style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', width: '34px' }}>{item.label}</span>
                    <div style={{ flex: 1, height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: '2px',
                        width: `${(item.value / item.max) * 100}%`,
                        background: item.value === item.max ? 'var(--green)' : 'var(--amber)',
                        transition: 'width 0.8s ease-out',
                      }} />
                    </div>
                    <span style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-muted)', width: '28px', textAlign: 'right' }}>{item.value}/{item.max}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Researcher Panel                                         */
  /* ---------------------------------------------------------------- */

  const agentAActive = phase === 'running' && (storyStage === 'agent-a-working');
  const agentABorderStyle = agentAActive
    ? '3px solid var(--researcher)'
    : '1px solid var(--border)';

  const renderAgentAPanel = () => (
    <div style={{
      display: 'flex', flexDirection: 'column',
      borderRight: agentABorderStyle,
      transition: 'border 0.3s ease',
      boxShadow: agentAActive ? 'inset 3px 0 12px -4px rgba(37, 99, 235, 0.15)' : 'none',
    }}>
      <div style={{
        padding: '0.6rem 1rem', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0,
      }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '50%', background: 'var(--researcher)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: '0.65rem',
          boxShadow: agentAActive ? '0 0 0 3px rgba(37, 99, 235, 0.25)' : 'none',
          transition: 'box-shadow 0.3s ease',
        }}>R</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Researcher</div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>
            {agentAReceipts.length > 0 && agentACount > 0 ? (
              <span style={{ color: 'var(--green)' }}>finished -- {agentAReceipts.length} receipts</span>
            ) : agentAReceipts.length > 0 ? (
              <span className="typing-indicator" style={{ color: 'var(--researcher)' }}>working</span>
            ) : 'waiting'}
          </div>
        </div>
        {adversarial && phase === 'running' && (
          <div style={{
            ...mono, fontSize: '0.5rem', padding: '0.15rem 0.4rem',
            borderRadius: '4px', background: '#fef2f2', color: 'var(--red)',
            fontWeight: 600, border: '1px solid #fecaca',
          }}>
            ADVERSARIAL
          </div>
        )}
      </div>
      <div ref={agentARef} style={{
        flex: 1, overflowY: 'auto', padding: '0.8rem',
        display: 'flex', flexDirection: 'column', gap: '0.8rem',
        alignItems: 'flex-start', background: 'var(--bg)',
      }}>
        {agentAReceipts.map((r, i) => renderStoryStep(r, i))}
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Builder Panel                                            */
  /* ---------------------------------------------------------------- */

  const agentBActive = phase === 'running' && (storyStage === 'agent-b-working' || storyStage === 'agent-b-verifying' || storyStage === 'reviewing');

  const renderAgentBPanel = () => (
    <div style={{
      display: 'flex', flexDirection: 'column',
      borderLeft: agentBActive ? '3px solid var(--builder)' : '1px solid transparent',
      transition: 'border 0.3s ease',
      boxShadow: agentBActive ? 'inset -3px 0 12px -4px rgba(124, 58, 237, 0.15)' : 'none',
    }}>
      <div style={{
        padding: '0.6rem 1rem', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0,
      }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '50%', background: 'var(--builder)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: '0.65rem',
          boxShadow: agentBActive ? '0 0 0 3px rgba(124, 58, 237, 0.25)' : 'none',
          transition: 'box-shadow 0.3s ease',
        }}>B</div>
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Builder</div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>
            {fabricationDetected ? (
              <span style={{ color: 'var(--red)', fontWeight: 600 }}>rejected handoff</span>
            ) : agentBReceipts.length > 0 ? (
              phase === 'done' ? (
                <span style={{ color: 'var(--green)' }}>finished -- {agentBReceipts.length} receipts</span>
              ) : (
                <span className="typing-indicator" style={{ color: 'var(--builder)' }}>working</span>
              )
            ) : verifications.length > 0 ? (
              <span className="typing-indicator" style={{ color: 'var(--builder)' }}>verifying chain...</span>
            ) : 'waiting for handoff'}
          </div>
        </div>
      </div>
      <div ref={agentBRef} style={{
        flex: 1, overflowY: 'auto', padding: '0.8rem',
        display: 'flex', flexDirection: 'column', gap: '0.8rem',
        alignItems: 'flex-end', background: 'var(--bg)',
      }}>
        {fabricationDetected && agentBReceipts.length === 0 && (
          <div className="slide-up" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', gap: '0.8rem', textAlign: 'center',
            width: '100%',
          }}>
            <div className="stamp" style={{
              width: '80px', height: '80px', borderRadius: '50%',
              background: '#fef2f2', border: '4px solid var(--red)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 0 4px rgba(220, 38, 38, 0.15), 0 0 20px rgba(220, 38, 38, 0.1)',
            }}>
              <span style={{ fontSize: '2.5rem', color: 'var(--red)', fontWeight: 800, lineHeight: 1 }}>X</span>
            </div>
            <div style={{ color: 'var(--red)', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '0.05em' }}>Handoff Rejected</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', maxWidth: '280px', lineHeight: 1.6 }}>
              The Researcher's receipt chain contains fabricated data.
              The Builder refuses the handoff.
            </div>
            <div style={{
              ...mono, fontSize: '0.55rem', color: '#991b1b',
              padding: '0.5rem 0.8rem', borderRadius: '6px',
              background: '#fef2f2', border: '2px solid #fecaca',
              marginTop: '0.2rem', lineHeight: 1.6,
              animation: 'pulse-red-border 2s ease-in-out infinite',
            }}>
              <div>The data was modified after signing — the proof doesn't match</div>
              <div style={{ marginTop: '0.2rem', color: '#b91c1c' }}>Chain integrity compromised</div>
            </div>
            <div style={{
              ...mono, fontSize: '0.6rem', color: '#991b1b',
              padding: '0.4rem 0.8rem', borderRadius: '6px',
              background: '#fef2f2', border: '1px solid #fecaca',
              marginTop: '0.1rem',
            }}>
              Zero trust = zero damage
            </div>
          </div>
        )}
        {agentBReceipts.map((r, i) => renderStoryStep(r, agentACount + i))}
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Bottom Summary Bar                                       */
  /* ---------------------------------------------------------------- */

  const renderBottomSummary = () => {
    if (phase !== 'done') {
      return (
        <div style={{
          padding: '0.3rem 1.5rem', borderTop: '1px solid var(--border)',
          background: 'var(--surface)', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-dim)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: '1.2rem' }}>
            <a href="/verify" style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-dim)', textDecoration: 'none', borderBottom: '1px dashed var(--border-dashed)' }}>Verify</a>
            <a href="/dashboard" style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-dim)', textDecoration: 'none', borderBottom: '1px dashed var(--border-dashed)' }}>Dashboard</a>
            <a href="/trial" style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-dim)', textDecoration: 'none', borderBottom: '1px dashed var(--border-dashed)' }}>Replay</a>
          </div>
          <span style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)' }}>
            {adversarial ? 'adversarial mode' : lowQuality ? 'low quality mode' : 'honest mode'}
          </span>
        </div>
      );
    }

    const passedCount = verificationsPassedCount;
    const totalVerifications = verifications.length;

    return (
      <div style={{
        padding: '0.6rem 1.5rem', borderTop: '2px solid var(--border)',
        background: fabricationDetected ? '#fef2f2' : 'var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, transition: 'background 0.3s ease',
      }}>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          {/* Receipts count */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ ...mono, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
              {totalReceiptsGenerated}
            </div>
            <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Receipts
            </div>
          </div>

          <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />

          {/* Trust score */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              ...mono, fontSize: '1.1rem', fontWeight: 700,
              color: trustScore !== null
                ? (trustScore >= 80 ? 'var(--green)' : trustScore >= 50 ? 'var(--amber)' : 'var(--red)')
                : 'var(--text-dim)',
            }}>
              {trustScore !== null ? trustScore : '--'}
            </div>
            <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Trust
            </div>
          </div>

          <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />

          {/* Verifications */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              ...mono, fontSize: '1.1rem', fontWeight: 700,
              color: passedCount === totalVerifications ? 'var(--green)' : 'var(--red)',
            }}>
              {passedCount}/{totalVerifications}
            </div>
            <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Verified
            </div>
          </div>

          {/* Usefulness */}
          {reviewScores && (
            <>
              <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  ...mono, fontSize: '1.1rem', fontWeight: 700,
                  color: reviewScores.composite >= 70 ? 'var(--green)' : reviewScores.composite >= 40 ? 'var(--amber)' : 'var(--red)',
                }}>
                  {reviewScores.composite}
                </div>
                <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                  Quality
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {!fabricationDetected && receipts.length > 0 && (
            <button
              onClick={() => {
                const chainJson = JSON.stringify(receipts);
                const encoded = encodeURIComponent(chainJson);
                if (encoded.length < 8000) {
                  window.open(`/verify?chain=${encoded}&auto=1`, '_blank');
                } else {
                  sessionStorage.setItem('receipt-verify-chain', chainJson);
                  window.open('/verify?from=session&auto=1', '_blank');
                }
              }}
              style={{
                padding: '0.35rem 0.8rem', borderRadius: '6px',
                border: '1px solid var(--green)', background: 'rgba(22, 163, 74, 0.06)',
                color: 'var(--green)', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: '0.72rem', fontWeight: 600,
              }}
            >
              Verify This Chain
            </button>
          )}
          <button onClick={run} style={{
            padding: '0.35rem 0.8rem', borderRadius: '6px', border: 'none',
            background: adversarial ? 'var(--red)' : 'var(--text)',
            color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.72rem', fontWeight: 600,
          }}>
            Run Again
          </button>
        </div>
      </div>
    );
  };

  /* ---------------------------------------------------------------- */
  /*  Main Render                                                      */
  /* ---------------------------------------------------------------- */

  return (
    <div
      className={showShake ? 'screen-shake' : ''}
      style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        background: adversarial && phase === 'running' ? '#faf5f5' : 'var(--bg)',
        transition: 'background 0.5s ease',
        position: 'relative',
      }}
    >
      <style>{`
        @media (max-width: 768px) {
          .demo-panels { grid-template-columns: 1fr !important; grid-template-rows: 1fr auto 1fr !important; }
          .demo-center-panel { width: 100% !important; border-right: none !important; border-bottom: 1px solid var(--border); max-height: 150px; }
          .demo-agent-panel { border-right: none !important; border-left: none !important; max-height: 50vh; }
          .demo-idle { padding: 1.5rem 1rem !important; }
          .demo-idle h2 { font-size: 1.5rem !important; }
          .demo-nav-links { gap: 0.8rem !important; }
          .demo-stage-dots { flex-wrap: wrap !important; }
          .demo-flow-preview { flex-direction: column !important; align-items: stretch !important; }
        }
      `}</style>

      {/* Flash overlay for fabrication detection */}
      {showFlash && (
        <div className="flash-overlay" style={{
          position: 'fixed', inset: 0,
          background: 'rgba(220, 38, 38, 0.3)',
          pointerEvents: 'none', zIndex: 100,
        }} />
      )}
      {showAmberFlash && (
        <div className="flash-amber-overlay" style={{
          position: 'fixed', inset: 0,
          background: 'rgba(217, 119, 6, 0.25)',
          pointerEvents: 'none', zIndex: 100,
        }} />
      )}

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
        <a href="/" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', textDecoration: 'none', letterSpacing: '0.03em' }}>
          R.E.C.E.I.P.T.
        </a>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <a href="/" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Home</a>
          <a href="/demo" style={{ fontSize: '0.75rem', color: 'var(--text)', textDecoration: 'none', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>Demo</a>
          <a href="/verify" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Verify</a>
          <a href="/dashboard" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Dashboard</a>
          <a href="/trial" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Replay</a>
        </div>
      </nav>

      {/* Demo Sub-Header */}
      <header style={{
        padding: '0.5rem 1.5rem', borderBottom: '1px solid var(--border)',
        background: adversarial && phase === 'running' ? '#fef8f8' : lowQuality && phase === 'running' ? '#fffdf5' : 'var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, transition: 'background 0.3s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>Live Demo</h1>
            <p style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>
              {phase === 'idle' ? 'Choose a mode and start the demo' :
                phase === 'running' ? `Running ${adversarial ? '(adversarial)' : lowQuality ? '(low quality)' : '(honest)'} -- watching agents generate receipts` :
                  fabricationDetected ? 'Complete -- fabrication detected and rejected' :
                    qualityRejected ? 'Complete -- quality gate rejected the chain' :
                    'Complete -- all receipts verified'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          {/* AXL status during run */}
          {phase !== 'idle' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.3rem 0.6rem', borderRadius: '6px',
              background: axlStatus.researcher && axlStatus.builder ? '#f0fdf4' : axlStatus.researcher || axlStatus.builder ? '#fffbeb' : '#fef2f2',
              border: `1px solid ${axlStatus.researcher && axlStatus.builder ? '#bbf7d0' : axlStatus.researcher || axlStatus.builder ? '#fde68a' : '#fecaca'}`,
            }}>
              <div style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: axlStatus.researcher && axlStatus.builder ? 'var(--green)' : axlStatus.researcher || axlStatus.builder ? 'var(--amber)' : 'var(--red)',
                boxShadow: axlStatus.researcher && axlStatus.builder ? '0 0 5px rgba(34,197,94,0.4)' : 'none',
              }} />
              <span style={{ ...mono, fontSize: '0.55rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                AXL {axlStatus.researcher && axlStatus.builder ? 'LIVE' : 'SIM'}
              </span>
            </div>
          )}
          {/* Inline adversarial toggle for header (during run) */}
          {phase !== 'idle' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.3rem 0.6rem', borderRadius: '6px',
              background: adversarial ? '#fef2f2' : lowQuality ? '#fffbeb' : '#f0fdf4',
              border: `1px solid ${adversarial ? '#fecaca' : lowQuality ? '#fde68a' : '#bbf7d0'}`,
            }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: adversarial ? 'var(--red)' : lowQuality ? 'var(--amber)' : 'var(--green)',
              }} />
              <span style={{
                ...mono, fontSize: '0.6rem', fontWeight: 600,
                color: adversarial ? 'var(--red)' : lowQuality ? 'var(--amber)' : 'var(--green)',
              }}>
                {adversarial ? 'ADVERSARIAL' : lowQuality ? 'LOW QUALITY' : 'HONEST'}
              </span>
            </div>
          )}
          {phase !== 'idle' && phase !== 'done' && (
            <button disabled style={{
              padding: '0.4rem 0.9rem', borderRadius: '6px', border: 'none',
              background: 'var(--border)', color: '#fff',
              cursor: 'not-allowed', fontFamily: 'inherit',
              fontSize: '0.78rem', fontWeight: 600,
            }}>
              Running...
            </button>
          )}
        </div>
      </header>

      {/* Narrator Bar / Chapter Pause */}
      {phase !== 'idle' && (chapterPause || narrative) && (
        <div style={{
          padding: chapterPause ? '1rem 1.5rem' : '0.7rem 1.5rem',
          borderBottom: `1px solid ${chapterPause ? 'var(--researcher)' : 'var(--border)'}`,
          background: chapterPause ? '#f0f4ff' : fabricationDetected ? '#fef2f2' : 'var(--surface)',
          transition: 'all 0.3s',
          flexShrink: 0,
          minHeight: '90px',
        }}>
          {chapterPause ? (
            <div style={{ maxWidth: '700px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                <span style={{
                  ...mono, fontSize: '0.6rem', fontWeight: 700,
                  padding: '0.2rem 0.5rem', borderRadius: '4px',
                  background: 'var(--researcher)', color: '#fff',
                }}>
                  {chapterPause.chapter} / 5
                </span>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
                  {chapterPause.title}
                </span>
              </div>
              <p style={{
                fontSize: '0.82rem', lineHeight: 1.6, color: 'var(--text-muted)',
                fontFamily: 'Inter, sans-serif', margin: '0 0 0.8rem 0',
              }}>
                {chapterPause.body}
              </p>
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                <button
                  onClick={() => { setChapterPause(null); resumeRef.current?.(); }}
                  style={{
                    padding: '0.5rem 1.5rem', borderRadius: '6px', border: 'none',
                    background: 'var(--text)', color: '#fff', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600,
                  }}
                >
                  Continue
                </button>
                <button
                  onClick={() => { guidedRef.current = false; setGuidedMode(false); setChapterPause(null); resumeRef.current?.(); }}
                  style={{
                    padding: '0.5rem 1rem', borderRadius: '6px',
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--text-dim)', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 500,
                  }}
                >
                  Skip tour
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{
                fontSize: '0.78rem', lineHeight: 1.5,
                color: fabricationDetected ? 'var(--red)' : 'var(--text)',
                fontWeight: narrativeHighlight ? 500 : 400,
                transition: 'font-weight 0.3s',
                maxWidth: '900px',
                minHeight: '24px',
              }}>
                {narrative}
              </div>
              {/* Chain integrity meter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                <div style={{ flex: 1, height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${receipts.length > 0 ? ((verificationsPassedCount / Math.max(totalReceiptsGenerated, 1)) * 100) : 0}%`,
                    background: fabricationDetected ? 'var(--red)' : 'var(--green)',
                    borderRadius: '2px',
                    transition: 'width 0.5s ease, background 0.3s ease',
                  }} />
                </div>
                <span style={{ ...mono, fontSize: '0.5rem', color: fabricationDetected ? 'var(--red)' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                  {verificationsPassedCount}/{totalReceiptsGenerated} verified
                </span>
              </div>
              {/* Story stage indicator */}
              {phase === 'running' && (
                <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.4rem' }}>
                  {(['agent-a-working', 'axl-handoff', 'agent-b-verifying', adversarial ? 'agent-b-rejected' : 'agent-b-working', 'anchoring'] as StoryStage[]).map((stage, i) => {
                    const labels = ['Researcher', 'Handoff', 'Verification', adversarial ? 'Rejected' : 'Builder', 'Record'];
                    const stageOrder: StoryStage[] = ['agent-a-working', 'axl-handoff', 'agent-b-verifying', adversarial ? 'agent-b-rejected' : 'agent-b-working', 'anchoring'];
                    const currentIdx = stageOrder.indexOf(storyStage);
                    const isActive = stage === storyStage;
                    const isPast = i < currentIdx;
                    return (
                      <div key={stage} style={{
                        ...mono, fontSize: '0.52rem', padding: '0.15rem 0.4rem',
                        borderRadius: '4px',
                        background: isActive ? (stage === 'agent-b-rejected' ? '#fef2f2' : '#f0f4ff') :
                          isPast ? 'var(--surface)' : 'transparent',
                        border: isActive ? `1px solid ${stage === 'agent-b-rejected' ? 'var(--red)' : 'var(--researcher)'}` :
                          isPast ? '1px solid var(--border)' : '1px solid transparent',
                        color: isActive ? (stage === 'agent-b-rejected' ? 'var(--red)' : 'var(--researcher)') :
                          isPast ? 'var(--green)' : 'var(--text-dim)',
                        fontWeight: isActive ? 700 : 400,
                        transition: 'all 0.3s ease',
                      }}>
                        {isPast ? '✓ ' : ''}{labels[i]}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Idle State */}
      {phase === 'idle' && renderIdleState()}

      {/* Running / Done -- Dual Panels */}
      {phase !== 'idle' && (
        <div className="demo-panels" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', flex: 1, overflow: 'hidden' }}>
          {renderAgentAPanel()}
          {renderCenterPanel()}
          {renderAgentBPanel()}
        </div>
      )}

      {/* Bottom bar */}
      {renderBottomSummary()}
    </div>
  );
}
