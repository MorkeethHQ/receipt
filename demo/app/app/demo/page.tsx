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
  mcp_tool: 'MCP Tool',
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
      return 'The Researcher is about to lie. It says it verified the contract on-chain — but it never actually called the chain scanner. It assumed the data. The signature was computed on real data — the fabricated version won\'t match.';
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
    return 'CAUGHT. The Researcher said "I verified the contract" — but it didn\'t. It assumed the data. The hash doesn\'t match what was signed. The Builder rejects the entire chain. This is how RECEIPT catches agents that skip steps and guess.';
  }
  if (event === 'axl_handoff') {
    return data.mode === 'live'
      ? 'Chain handed off via Gensyn AXL P2P — two independent nodes, encrypted Yggdrasil mesh, no central server. The proof moved directly from Researcher to Builder without any intermediary touching it.'
      : 'Gensyn AXL: Chain handed off directly (cloud deployment). In production, this travels peer-to-peer between independent AXL nodes over an encrypted Yggdrasil mesh — no central server, no API relay.';
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
      ? 'Fabrication caught. The agent said it did the work, but it didn\'t. No tampered data reaches the next agent. This is the trust guarantee — skip a step, and the proof breaks before anyone relies on it.'
      : 'Complete. Every action proven, every handoff verified, quality scored and recorded on-chain. This chain is a permanent, verifiable record of useful agent work.';
  }
  if (event === 'review_start') {
    return 'The Builder is scoring the chain\'s usefulness. Existing tools stop at "did the agent run." RECEIPT answers the harder question: "was the output actually worth paying for?"';
  }
  if (event === 'review_scores') {
    const { alignment, substance, quality, composite } = data;
    const verdict = composite >= 60 ? 'Quality gate passed — this chain earns on-chain reputation and produces training-eligible data.'
      : 'Below threshold — this work cost tokens but produced little value. Not anchored on-chain.';
    return `Alignment: ${alignment}/100 (did it do what was asked?). Substance: ${substance}/100 (is the content meaningful?). Quality: ${quality}/100 (is the output good?). Composite: ${composite}/100. ${verdict}${data.attested ? ' Scores are hardware-verified.' : ''}`;
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
  const [anchorTx, setAnchorTx] = useState<{ txHash: string; explorer: string } | null>(null);
  const [nftMint, setNftMint] = useState<{ tokenId: string | null; txHash: string; explorer: string } | null>(null);
  const [guidedMode, setGuidedMode] = useState(true);
  const [chapterPause, setChapterPause] = useState<{ chapter: number; title: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pipelineMs, setPipelineMs] = useState<number | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [publishedVerifyUrl, setPublishedVerifyUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const chaptersShownRef = useRef<Set<number>>(new Set());

  const guidedRef = useRef(true);
  const resumeRef = useRef<(() => void) | null>(null);
  const switchAndRunRef = useRef(false);

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
      // Auto-publish chain to server and capture the shareable verify URL
      fetch('/api/chains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipts,
          agentId: adversarial ? 'demo-adversarial' : 'demo-honest',
          rootHash: chainRootHash,
          quality: reviewScores?.composite ?? null,
        }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.verifyUrl) setPublishedVerifyUrl(data.verifyUrl);
        })
        .catch(() => {});
    }
  }, [phase, receipts, adversarial, chainRootHash, reviewScores]);

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

  const agentAReceipts = receipts.filter(r => (receiptMeta[r.id]?.agent || 'A') === 'A');
  const agentBReceipts = receipts.filter(r => receiptMeta[r.id]?.agent === 'B');

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
        if (data.reasoning) {
          addCenterLog(`Review: ${data.reasoning.slice(0, 120)}${data.reasoning.length > 120 ? '...' : ''}`, 'tee');
        }
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
      case 'anchor_tx':
        setAnchorTx({ txHash: data.txHash, explorer: data.explorer });
        addCenterLog(`Anchored on 0G Mainnet: ${data.txHash.slice(0, 12)}...`, 'anchor');
        addTiming('On-chain anchor', Math.round(elapsed));
        break;
      case 'nft_minted':
        setNftMint({ tokenId: data.tokenId, txHash: data.txHash, explorer: `https://chainscan.0g.ai/tx/${data.txHash}` });
        addCenterLog(`ERC-7857 Identity minted${data.tokenId ? ` (#${data.tokenId})` : ''}`, 'anchor');
        addTiming('Agent NFT', Math.round(elapsed));
        break;
      case 'erc8004_validation':
        addCenterLog(`ERC-8004: Validation posted (${data.score}/100)`, 'anchor');
        addTiming('ERC-8004', Math.round(elapsed));
        break;
      case 'error':
        setPipelineError(data.message || 'Pipeline error');
        addCenterLog(`ERROR: ${(data.message || 'Unknown error').slice(0, 80)}`, 'fail');
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
    setAnchorTx(null);
    setNftMint(null);
    setCopied(false);
    setPipelineMs(null);
    setPipelineError(null);
    setPublishedVerifyUrl(null);
    setLinkCopied(false);
    eventIndexRef.current = 0;
    lastEventTimeRef.current = 0;
    setChapterPause(null);
    chaptersShownRef.current = new Set();
    guidedRef.current = guidedMode;
    setNarrative('Starting agent pipeline. Each action will produce a cryptographically signed receipt.');
    setNarrativeHighlight(true);
    setTimeout(() => setNarrativeHighlight(false), 600);
    const pipelineStartTime = performance.now();

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
          addCenterLog('Gensyn AXL: cloud mode — handoff via direct pass (P2P available with local nodes)', 'info');
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
                item.data.mode === 'live' ? 'Handoff — P2P' : 'Handoff',
                item.data.mode === 'live'
                  ? 'Chain traveled peer-to-peer via Gensyn AXL. Builder will now verify every receipt.'
                  : 'Chain handed off. Builder will now verify every receipt independently.');
            } else if (item.event === 'verification_complete') {
              await showChapter(3, 'Verified',
                'Every signature and hash link checked. The Researcher\'s work is authentic.');
            } else if (item.event === 'fabrication_detected') {
              await showChapter(3, 'Lie caught',
                'Receipt #2 was fabricated. Hash doesn\'t match. Chain rejected.');
            } else if (item.event === 'review_start') {
              await showChapter(4, 'Scoring usefulness',
                'A separate model inside a TEE enclave scores the chain. The agent can\'t pick its own grader.');
            } else if (item.event === 'review_scores' || item.event === 'quality_gate') {
              const isGood = item.event === 'review_scores' && item.data.composite >= 60;
              const isRejected = item.event === 'quality_gate' && !item.data.passed;
              if (isRejected) {
                await showChapter(5, 'REJECTED',
                  `Score: ${item.data.score}/100. Not anchored on-chain. Not used for training.`);
              } else if (isGood) {
                await showChapter(5, 'Quality work',
                  `Score: ${item.data.composite}/100. Anchored on 0G Mainnet. Becomes training data.`);
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

    try {
      // Phase 1: Researcher creates chain, sends via AXL (streams live)
      lastEventTimeRef.current = performance.now();
      const { events: researcherEvents } = await streamSSE('/api/researcher', { adversarial });

      const researcherDone = researcherEvents.find(e => e.event === 'researcher_done');
      const researcherChain = researcherDone?.data?.receipts;
      const researcherPubKey = researcherDone?.data?.publicKey;

      // Chapter 1: Researcher done
      await showChapter(1, 'Researcher done',
        adversarial
          ? '5 receipts signed — but one is a lie. Handing off to the Builder.'
          : '5 receipts signed and hash-linked. Handing off to the Builder for verification.');

      // Phase 2: Builder receives via AXL, verifies, extends (streams live)
      if (researcherChain && researcherChain.length > 0) {
        await streamSSE('/api/builder', {
          receipts: researcherChain,
          publicKey: researcherPubKey,
        });
      } else {
        const errorEvent = researcherEvents.find(e => e.event === 'error');
        setPipelineError(errorEvent?.data?.message || 'Researcher failed to produce receipts');
      }
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : 'Pipeline error — try again');
    }

    setChapterPause(null);
    setPipelineMs(Math.round(performance.now() - pipelineStartTime));
    setPhase('done');
  }, [adversarial, handleEvent, guidedMode]);

  useEffect(() => {
    if (switchAndRunRef.current) {
      switchAndRunRef.current = false;
      run();
    }
  }, [adversarial, run]);

  /* ---------------------------------------------------------------- */
  /*  Render: Receipt Card                                             */
  /* ---------------------------------------------------------------- */

  const renderReceipt = (receipt: Receipt, index: number) => {
    const meta = receiptMeta[receipt.id];
    const isTampered = tamperedIds.has(receipt.id);

    return (
      <div key={receipt.id} className="slide-up" style={{ maxWidth: '320px', width: '100%' }}>
        <div className={`receipt-card ${isTampered ? 'tampered' : ''}`} style={{ fontSize: '0.75rem' }}>
          <div style={{ padding: '0.3rem 0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ ...mono, fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.04em' }}>R.E.C.E.I.P.T.</span>
            <span style={{ ...mono, fontSize: '0.48rem', color: 'var(--text-dim)' }} title={receipt.id}>#{index} · {receipt.id.slice(0, 8)}</span>
          </div>
          <div className="dashed" />
          {receipt.prevId && (
            <div style={{ padding: '0.1rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(37,99,235,0.04)' }}>
              <span style={{ ...mono, fontSize: '0.44rem', color: 'var(--researcher)', fontWeight: 600 }}>PREV</span>
              <span style={{ ...mono, fontSize: '0.44rem', color: 'var(--text-dim)' }}>{receipt.prevId.slice(0, 12)}...</span>
              <span style={{ ...mono, fontSize: '0.44rem', color: 'var(--green)', marginLeft: 'auto' }}>linked</span>
            </div>
          )}
          {!receipt.prevId && index === 0 && (
            <div style={{ padding: '0.1rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(37,99,235,0.04)' }}>
              <span style={{ ...mono, fontSize: '0.44rem', color: 'var(--researcher)', fontWeight: 600 }}>CHAIN START</span>
            </div>
          )}
          <div style={{ padding: '0.25rem 0.6rem', ...mono, fontSize: '0.62rem', lineHeight: 1.6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>ACTION</span>
              <span style={{ fontWeight: 600 }}>{receipt.action.type}</span>
            </div>
            {(receipt.action.type === 'llm_call' || receipt.action.type === 'usefulness_review') && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>SOURCE</span>
                <span style={{ fontWeight: 600, color: meta?.teeAttested ? 'var(--green)' : meta?.llmSource === '0g-compute' ? 'var(--amber)' : 'var(--text-muted)' }}>
                  {meta?.teeAttested ? 'TEE Verified' : meta?.llmSource === '0g-compute' ? '0G Compute' : 'Unverified'}
                </span>
              </div>
            )}
            {receipt.action.type === 'usefulness_review' && reviewScores && (
              <div style={{ marginTop: '0.15rem' }}>
                {(['alignment', 'substance', 'quality'] as const).map(axis => (
                  <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.1rem' }}>
                    <span style={{ color: 'var(--text-dim)', width: '40px', textTransform: 'uppercase', fontSize: '0.5rem' }}>{axis.slice(0, 5)}</span>
                    <div style={{ flex: 1, height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: '2px',
                        width: `${reviewScores[axis]}%`,
                        background: reviewScores[axis] >= 70 ? 'var(--green)' : reviewScores[axis] >= 40 ? 'var(--amber)' : 'var(--red)',
                        transition: 'width 1s ease-out',
                      }} />
                    </div>
                    <span style={{ fontSize: '0.5rem', fontWeight: 600, width: '20px', textAlign: 'right' }}>{reviewScores[axis]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="dashed" />
          <div style={{ padding: '0.2rem 0.6rem', ...mono, fontSize: '0.5rem', color: 'var(--text-muted)' }}>
            IN {receipt.inputHash.slice(0, 16)}... OUT {receipt.outputHash.slice(0, 16)}...
            {isTampered && <span style={{ color: 'var(--red)', marginLeft: '0.3rem' }}>MISMATCH</span>}
          </div>
          <div className="dashed" />
          <div style={{ padding: '0.2rem 0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ ...mono, fontSize: '0.6rem', fontWeight: 700 }}>
              {isTampered ? (
                <span className="stamp" style={{ color: 'var(--red)', letterSpacing: '0.08em' }}>TAMPERED</span>
              ) : (
                <span style={{ color: 'var(--text-dim)', letterSpacing: '0.04em' }}>SIGNED</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', ...mono, fontSize: '0.48rem', color: 'var(--text-dim)' }}>
              {meta?.teeAttested && <span style={{ color: 'var(--green)' }}>TEE &#10003;</span>}
              {meta?.durationMs != null && <span>{(meta.durationMs / 1000).toFixed(1)}s</span>}
            </div>
          </div>
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
      <div key={receipt.id} className="slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', alignItems: isAgent === 'A' ? 'flex-start' : 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <div style={{
            ...mono, fontSize: '0.5rem', fontWeight: 700,
            color: '#fff',
            background: isAgent === 'A' ? 'var(--researcher)' : 'var(--builder)',
            padding: '0.05rem 0.35rem', borderRadius: '8px',
            lineHeight: 1.4,
          }}>
            {stepNum}
          </div>
          <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            {receipt.action.description}
          </span>
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
        <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginBottom: '1rem', ...mono }}>
          The evaluation layer for AI agents
        </p>
        <p style={{ fontSize: '0.92rem', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '1.5rem' }}>
          A Researcher agent gathers data. A Builder agent verifies every claim independently.
          Every action is signed, hash-linked, and scored for usefulness.
        </p>

        {/* Mode selector — two modes */}
        <div style={{
          background: adversarial ? '#fef2f2' : 'var(--surface)',
          border: `2px solid ${adversarial ? 'var(--red)' : 'var(--border)'}`,
          borderRadius: '12px', padding: '1.2rem 1.8rem',
          marginBottom: '1.5rem',
          transition: 'all 0.3s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
            {([
              { key: 'honest', label: 'Honest Agent', active: !adversarial, color: 'var(--green)', bg: '#f0fdf4' },
              { key: 'adversarial', label: 'Catch the Lie', active: adversarial, color: 'var(--red)', bg: '#fef2f2' },
            ] as const).map(mode => (
              <button
                key={mode.key}
                onClick={() => setAdversarial(mode.key === 'adversarial')}
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
          <p style={{ fontSize: '0.78rem', color: adversarial ? '#991b1b' : 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
            {adversarial
              ? 'The Researcher claims it verified a contract — but it never actually checked. Watch the Builder catch a fabricated receipt.'
              : 'Both agents work honestly. Every action signed and hash-linked. The full chain verifies.'}
          </p>
        </div>

        {/* Start button — primary action */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.8rem', marginBottom: '1.5rem' }}>
          <button onClick={run} className="pulse-btn" style={{
            padding: '0.8rem 2.5rem', borderRadius: '8px', border: 'none',
            background: adversarial ? 'var(--red)' : 'var(--text)',
            color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '1rem', fontWeight: 600, transition: 'all 0.2s ease',
          }}>
            {adversarial ? 'Start — Catch the Lie' : 'Start Demo'}
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

        {/* Flow preview — below the fold */}
        <div className="demo-flow-preview" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
          flexWrap: 'wrap', marginBottom: '1rem',
        }}>
          {['5 Receipts', 'P2P Handoff', 'Verify Chain', adversarial ? 'Rejected' : 'Score Quality', adversarial ? null : 'Anchor On-Chain'].filter(Boolean).map((step, i, arr) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <div style={{
                ...mono, fontSize: '0.58rem', padding: '0.25rem 0.5rem',
                borderRadius: '6px', background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--text-muted)', fontWeight: 500,
              }}>
                {step}
              </div>
              {i < arr.length - 1 && <span style={{ color: 'var(--text-dim)', fontSize: '0.65rem' }}>&#8594;</span>}
            </div>
          ))}
        </div>

        {/* Transport status — compact */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
          ...mono, fontSize: '0.52rem', color: 'var(--text-dim)',
        }}>
          {(['researcher', 'builder'] as const).map(node => {
            const status = axlStatus[node];
            return (
              <div key={node} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <div style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: status === null ? 'var(--text-dim)' : status ? 'var(--green)' : 'var(--text-dim)',
                  boxShadow: status ? '0 0 4px rgba(34,197,94,0.4)' : 'none',
                }} />
                <span style={{ textTransform: 'capitalize' }}>{node}</span>
                <span>{status === null ? '...' : status ? 'P2P' : 'HTTP'}</span>
              </div>
            );
          })}
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
        <div style={{ ...mono, fontSize: '0.62rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '0.04em', textAlign: 'center' }}>
          CHAIN STATUS
        </div>
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
          <div style={{ ...mono, fontSize: '0.52rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '0.3rem' }}>
            Chain traveling peer-to-peer via Gensyn AXL
          </div>
          {/* A2A Protocol Envelope */}
          <div style={{
            padding: '0.35rem 0.5rem', borderRadius: '4px',
            background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.15)',
          }}>
            <div style={{ ...mono, fontSize: '0.45rem', color: 'var(--researcher)', fontWeight: 700, marginBottom: '0.2rem', letterSpacing: '0.04em' }}>
              A2A PROTOCOL ENVELOPE
            </div>
            <pre style={{
              ...mono, fontSize: '0.42rem', color: 'var(--text-dim)', lineHeight: 1.5,
              margin: 0, whiteSpace: 'pre', overflow: 'hidden',
            }}>{`{
  "jsonrpc": "2.0",
  "method": "SendMessage",
  "params": {
    "message": {
      "parts": [{ "type": "data",
        "data": { "bundle": {
          "receipts": [${receipts.length}],
          "chainRootHash": "${(chainRootHash || '').slice(0, 12)}..."
  }}]}}}
}`}</pre>
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
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }}>
                  {[
                    { label: 'sig', ok: v.checks.signatureValid, title: 'Ed25519 signature' },
                    { label: 'hash', ok: v.checks.chainLinkValid, title: 'Hash chain link' },
                    { label: 'time', ok: v.checks.timestampValid, title: 'Timestamp order' },
                  ].map(check => (
                    <span key={check.label} title={check.title} style={{
                      ...mono, fontSize: '0.48rem', fontWeight: 700,
                      padding: '0.05rem 0.2rem', borderRadius: '2px',
                      background: check.ok ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
                      color: check.ok ? 'var(--green)' : 'var(--red)',
                      border: `1px solid ${check.ok ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)'}`,
                    }}>
                      {check.ok ? '✓' : '✗'} {check.label}
                    </span>
                  ))}
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
      <div style={{ padding: '0.5rem 0.8rem', borderTop: '1px solid var(--border)', background: 'var(--bg)', flex: 1, overflowY: 'auto', minHeight: 0 }}>
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

        {/* Pipeline error */}
        {pipelineError && (
          <div className="slide-up" style={{
            padding: '0.5rem', borderRadius: '6px',
            background: '#fef2f2', border: '2px solid var(--red)',
            marginBottom: '0.4rem',
          }}>
            <div style={{ ...mono, fontSize: '0.62rem', color: 'var(--red)', fontWeight: 700, marginBottom: '0.15rem' }}>
              PIPELINE ERROR
            </div>
            <div style={{ fontSize: '0.52rem', color: '#991b1b', lineHeight: 1.5, wordBreak: 'break-word' }}>
              {pipelineError.slice(0, 200)}
            </div>
            <button
              onClick={run}
              style={{
                marginTop: '0.3rem', padding: '0.25rem 0.6rem', borderRadius: '4px', border: 'none',
                background: 'var(--text)', color: '#fff', cursor: 'pointer', ...mono,
                fontSize: '0.55rem', fontWeight: 600,
              }}
            >
              Retry
            </button>
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

        {/* Chain verified + provenance summary */}
        {phase === 'done' && !fabricationDetected && !qualityRejected && (
          <div className="slide-up" style={{ textAlign: 'center', marginBottom: '0.4rem' }}>
            <div style={{ ...mono, fontSize: '0.72rem', color: 'var(--green)', fontWeight: 700, marginBottom: '0.3rem' }}>
              CHAIN VERIFIED
            </div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.55rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {(() => {
                const agents = new Set(receipts.map(r => receiptMeta[r.id]?.agent || 'A'));
                const teeCount = receipts.filter(r => receiptMeta[r.id]?.teeAttested).length;
                const parts: string[] = [];
                parts.push(`${agents.size} agent${agents.size > 1 ? 's' : ''}`);
                parts.push(`${receipts.length} receipts`);
                parts.push(`${verificationsPassedCount}/${verifications.length} verified`);
                if (teeCount > 0) parts.push(`${teeCount} TEE-attested`);
                if (reviewScores) parts.push(`quality ${reviewScores.composite}/100`);
                if (anchorTx) parts.push('anchored on 0G');
                return parts.join(' · ');
              })()}
            </div>
          </div>
        )}

        {/* 0G Verification Layers */}
        {phase === 'done' && !fabricationDetected && (
          <div className="slide-up" style={{
            padding: '0.5rem', borderRadius: '6px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            marginBottom: '0.4rem',
          }}>
            <div style={{ ...mono, fontSize: '0.52rem', color: 'var(--text-dim)', fontWeight: 700, marginBottom: '0.3rem', letterSpacing: '0.04em', textAlign: 'center' }}>
              VERIFIED BY 0G
            </div>
            {[
              {
                label: 'Compute',
                detail: 'TEE-attested inference',
                ok: receipts.some(r => receiptMeta[r.id]?.teeAttested),
              },
              {
                label: 'Identity',
                detail: nftMint ? `ERC-7857 #${nftMint.tokenId ?? ''}` : 'ERC-7857 agent ID',
                ok: !!nftMint,
              },
              {
                label: 'Training',
                detail: reviewScores ? `Quality ${reviewScores.composite}/100` : 'Quality-gated',
                ok: reviewScores ? reviewScores.composite >= 60 : false,
              },
            ].map(layer => (
              <div key={layer.label} style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.2rem 0.3rem', borderRadius: '4px',
                marginBottom: '0.1rem',
                background: layer.ok ? 'rgba(22,163,74,0.04)' : 'rgba(217,119,6,0.04)',
              }}>
                <span style={{
                  ...mono, fontSize: '0.55rem', fontWeight: 700,
                  color: layer.ok ? 'var(--green)' : 'var(--amber)',
                  width: '14px',
                }}>
                  {layer.ok ? '✓' : '—'}
                </span>
                <span style={{ ...mono, fontSize: '0.52rem', fontWeight: 600, color: 'var(--text)', width: '48px' }}>
                  {layer.label}
                </span>
                <span style={{ ...mono, fontSize: '0.48rem', color: 'var(--text-dim)' }}>
                  {layer.detail}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* On-chain TX links */}
        {(anchorTx || nftMint) && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: '0.2rem',
            marginBottom: '0.4rem',
          }}>
            {anchorTx && (
              <a href={anchorTx.explorer} target="_blank" rel="noopener noreferrer" style={{
                ...mono, fontSize: '0.5rem', color: 'var(--green)', textDecoration: 'none',
                padding: '0.25rem 0.4rem', background: 'rgba(22,163,74,0.06)',
                borderRadius: '4px', border: '1px solid rgba(22,163,74,0.2)',
                display: 'flex', alignItems: 'center', gap: '0.3rem',
              }}>
                <span style={{ fontWeight: 700 }}>ANCHOR TX</span>
                <span style={{ color: 'var(--text-dim)' }}>{anchorTx.txHash.slice(0, 14)}...</span>
              </a>
            )}
            {nftMint && (
              <a href={nftMint.explorer} target="_blank" rel="noopener noreferrer" style={{
                ...mono, fontSize: '0.5rem', color: '#c084fc', textDecoration: 'none',
                padding: '0.25rem 0.4rem', background: 'rgba(192,132,252,0.06)',
                borderRadius: '4px', border: '1px solid rgba(192,132,252,0.2)',
                display: 'flex', alignItems: 'center', gap: '0.3rem',
              }}>
                <span style={{ fontWeight: 700 }}>ERC-7857{nftMint.tokenId ? ` #${nftMint.tokenId}` : ''}</span>
                <span style={{ color: 'var(--text-dim)' }}>{nftMint.txHash.slice(0, 14)}...</span>
              </a>
            )}
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
            {/* Composite with threshold line */}
            <div style={{ textAlign: 'center', marginTop: '0.3rem' }}>
              <div style={{ position: 'relative', height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'visible', marginBottom: '0.2rem' }}>
                <div style={{
                  height: '100%', borderRadius: '4px',
                  width: `${reviewScores.composite}%`,
                  background: reviewScores.composite >= 70 ? 'var(--green)' : reviewScores.composite >= 40 ? 'var(--amber)' : 'var(--red)',
                  transition: 'width 1.5s ease-out',
                }} />
                {/* Threshold marker at 60% */}
                <div style={{
                  position: 'absolute', left: '60%', top: '-2px', bottom: '-2px',
                  width: '2px', background: 'var(--text)', borderRadius: '1px',
                }} />
                <div style={{
                  position: 'absolute', left: '60%', top: '-12px', transform: 'translateX(-50%)',
                  ...mono, fontSize: '0.4rem', color: 'var(--text-dim)', whiteSpace: 'nowrap',
                }}>
                  gate
                </div>
              </div>
              <AnimatedCounter
                target={reviewScores.composite}
                color={reviewScores.composite >= 70 ? 'var(--green)' : reviewScores.composite >= 40 ? 'var(--amber)' : 'var(--red)'}
              />
              <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', marginTop: '0.1rem' }}>COMPOSITE</div>
              <div style={{
                ...mono, fontSize: '0.5rem', marginTop: '0.15rem',
                color: reviewScores.composite >= 60 ? 'var(--green)' : 'var(--red)',
                fontWeight: 700,
              }}>
                {reviewScores.composite >= 60 ? 'GATE PASSED — anchored on-chain' : 'GATE FAILED — not anchored'}
              </div>
              {scoreDelta !== null && (
                <div style={{
                  ...mono, fontSize: '0.58rem', fontWeight: 700, marginTop: '0.15rem',
                  color: scoreDelta >= 0 ? 'var(--green)' : 'var(--red)',
                }}>
                  {scoreDelta >= 0 ? '+' : ''}{scoreDelta} vs avg
                </div>
              )}
            </div>
            {/* Reviewer reasoning */}
            {reviewScores.reasoning && (
              <div style={{
                marginTop: '0.4rem', padding: '0.35rem',
                background: 'var(--bg)', borderRadius: '4px',
                border: '1px solid var(--border)',
              }}>
                <div style={{ ...mono, fontSize: '0.48rem', color: 'var(--text-dim)', marginBottom: '0.15rem', fontWeight: 600 }}>TEE REVIEWER SAYS</div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.55rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {reviewScores.reasoning.slice(0, 150)}{reviewScores.reasoning.length > 150 ? '...' : ''}
                </div>
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
          </div>
          <span style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)' }}>
            {adversarial ? 'catch the lie' : 'honest mode'}
          </span>
        </div>
      );
    }

    const passedCount = verificationsPassedCount;
    const totalVerifications = verifications.length;

    return (
      <div className="demo-bottom-bar" style={{
        padding: '0.6rem 1.5rem', borderTop: '2px solid var(--border)',
        background: fabricationDetected ? '#fef2f2' : 'var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, transition: 'background 0.3s ease',
        flexWrap: 'wrap', gap: '0.5rem',
      }}>
        <div className="demo-bottom-metrics" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Verification Rate — hero metric */}
          {(() => {
            const rate = verifications.length > 0
              ? Math.round((verificationsPassedCount / verifications.length) * 100)
              : null;
            return (
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  ...mono, fontSize: '1.5rem', fontWeight: 700,
                  color: rate === null ? 'var(--text-dim)'
                    : rate === 100 ? 'var(--green)'
                    : rate >= 80 ? 'var(--amber)'
                    : 'var(--red)',
                }}>
                  {rate !== null ? `${rate}%` : '--%'}
                </div>
                <div style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Verification Rate
                </div>
              </div>
            );
          })()}

          <div style={{ width: '1px', height: '28px', background: 'var(--border)' }} />

          {/* Quality */}
          {reviewScores && (
            <>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  ...mono, fontSize: '1.1rem', fontWeight: 700,
                  color: reviewScores.composite >= 70 ? 'var(--green)' : reviewScores.composite >= 40 ? 'var(--amber)' : 'var(--red)',
                }}>
                  {reviewScores.composite}/100
                </div>
                <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                  Quality
                </div>
              </div>
              <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />
            </>
          )}

          {/* Receipts count */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ ...mono, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
              {totalReceiptsGenerated}
            </div>
            <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Receipts
            </div>
          </div>

          {/* Pipeline time */}
          {pipelineMs !== null && (
            <>
              <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ ...mono, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
                  {(pipelineMs / 1000).toFixed(1)}s
                </div>
                <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                  Time
                </div>
              </div>
            </>
          )}

          {/* Token count + Cost efficiency */}
          {reviewScores && (() => {
            const totalTokens = Object.values(receiptMeta).reduce((s, m) => s + (m.tokensUsed ?? 0), 0);
            if (totalTokens === 0) return null;
            const cost = totalTokens * 0.00015 / 1000;
            const costPerUseful = cost / (reviewScores.composite / 100);
            return (
              <>
                <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ ...mono, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
                    {totalTokens.toLocaleString()}
                  </div>
                  <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                    Tokens
                  </div>
                </div>
                <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    ...mono, fontSize: '0.85rem', fontWeight: 700,
                    color: costPerUseful < 0.001 ? 'var(--green)' : costPerUseful < 0.005 ? 'var(--amber)' : 'var(--red)',
                  }}>
                    ${costPerUseful.toFixed(4)}
                  </div>
                  <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                    $/useful
                  </div>
                </div>
              </>
            );
          })()}
        </div>

        {/* Shareable verify link — the key product moment */}
        {!fabricationDetected && publishedVerifyUrl && (
          <div className="slide-up" style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
            padding: '0.4rem 0.8rem', marginBottom: '0.4rem',
            background: 'rgba(22, 163, 74, 0.04)', border: '1px solid rgba(22, 163, 74, 0.25)',
            borderRadius: '6px',
          }}>
            <span style={{ ...mono, fontSize: '0.6rem', color: 'var(--green)', fontWeight: 600 }}>
              Chain published.
            </span>
            <span style={{ ...mono, fontSize: '0.55rem', color: 'var(--text-muted)' }}>
              Anyone can verify:
            </span>
            <a
              href={publishedVerifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                ...mono, fontSize: '0.55rem', color: 'var(--researcher)',
                textDecoration: 'underline', wordBreak: 'break-all',
                maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', display: 'inline-block',
              }}
              title={publishedVerifyUrl}
            >
              {publishedVerifyUrl.replace(/^https?:\/\//, '')}
            </a>
            <button
              onClick={() => {
                navigator.clipboard.writeText(publishedVerifyUrl);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 1500);
              }}
              style={{
                padding: '0.2rem 0.5rem', borderRadius: '4px',
                border: `1px solid ${linkCopied ? 'var(--green)' : 'var(--border)'}`,
                background: linkCopied ? 'rgba(22,163,74,0.06)' : 'transparent',
                color: linkCopied ? 'var(--green)' : 'var(--text-dim)',
                cursor: 'pointer', fontFamily: 'inherit',
                fontSize: '0.6rem', fontWeight: linkCopied ? 600 : 500,
                transition: 'all 0.2s ease',
              }}
            >
              {linkCopied ? '✓ Link Copied' : 'Copy Link'}
            </button>
            <a
              href="/team"
              style={{
                ...mono, fontSize: '0.55rem', color: 'var(--researcher)',
                textDecoration: 'none', fontWeight: 600,
                padding: '0.2rem 0.5rem', borderRadius: '4px',
                border: '1px solid rgba(37,99,235,0.2)',
                background: 'rgba(37,99,235,0.06)',
              }}
            >
              View in Dashboard &rarr;
            </a>
          </div>
        )}

        <div className="demo-bottom-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {!fabricationDetected && receipts.length > 0 && (
            <>
              <button
                onClick={() => {
                  if (publishedVerifyUrl) {
                    window.open(publishedVerifyUrl, '_blank');
                  } else {
                    // Fallback: publish chain first, then redirect
                    const chainJson = JSON.stringify(receipts);
                    fetch('/api/chains', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        receipts,
                        agentId: adversarial ? 'demo-adversarial' : 'demo-honest',
                        rootHash: chainRootHash,
                        quality: reviewScores?.composite ?? null,
                      }),
                    })
                      .then(res => res.json())
                      .then(data => {
                        if (data.verifyUrl) {
                          setPublishedVerifyUrl(data.verifyUrl);
                          window.open(data.verifyUrl, '_blank');
                        } else {
                          // Final fallback: sessionStorage
                          sessionStorage.setItem('receipt-verify-chain', chainJson);
                          window.open('/verify?from=session&auto=1', '_blank');
                        }
                      })
                      .catch(() => {
                        sessionStorage.setItem('receipt-verify-chain', chainJson);
                        window.open('/verify?from=session&auto=1', '_blank');
                      });
                  }
                }}
                style={{
                  padding: '0.35rem 0.8rem', borderRadius: '6px',
                  border: 'none', background: 'var(--green)',
                  color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: '0.72rem', fontWeight: 600,
                }}
              >
                Verify This Chain
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(receipts, null, 2));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                style={{
                  padding: '0.35rem 0.8rem', borderRadius: '6px',
                  border: `1px solid ${copied ? 'var(--green)' : 'var(--border)'}`,
                  background: copied ? 'rgba(22,163,74,0.06)' : 'transparent',
                  color: copied ? 'var(--green)' : 'var(--text-dim)',
                  cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: '0.72rem', fontWeight: copied ? 600 : 500,
                  transition: 'all 0.2s ease',
                }}
              >
                {copied ? '✓ Copied' : 'Copy JSON'}
              </button>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button onClick={() => { setAdversarial(!adversarial); switchAndRunRef.current = true; }} style={{
            padding: '0.45rem 1.2rem', borderRadius: '6px',
            border: `2px solid ${adversarial ? 'var(--green)' : 'var(--red)'}`,
            background: adversarial ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
            color: adversarial ? 'var(--green)' : 'var(--red)',
            cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.78rem', fontWeight: 700,
          }}>
            {adversarial ? 'Now Try Honest' : 'Now Try Adversarial'}
          </button>
          <button onClick={run} style={{
            padding: '0.45rem 1.2rem', borderRadius: '6px', border: 'none',
            background: adversarial ? 'var(--red)' : 'var(--text)',
            color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.78rem', fontWeight: 700,
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
        height: '100vh', display: 'flex', flexDirection: 'column',
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
          .demo-nav-links { gap: 0.8rem !important; font-size: 0.68rem !important; }
          .demo-stage-dots { flex-wrap: wrap !important; }
          .demo-flow-preview { flex-direction: column !important; align-items: stretch !important; }
          .demo-bottom-bar { flex-direction: column !important; align-items: stretch !important; gap: 0.4rem !important; padding: 0.4rem 1rem !important; }
          .demo-bottom-metrics { gap: 0.8rem !important; justify-content: center !important; }
          .demo-bottom-actions { justify-content: center !important; flex-wrap: wrap !important; }
          .demo-header-badges { display: none !important; }
        }
        @media (max-width: 1280px) {
          .demo-bottom-metrics { gap: 0.8rem !important; }
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
          <a href="/team" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Dashboard</a>
          <a href="/demo" style={{ fontSize: '0.75rem', color: 'var(--text)', textDecoration: 'none', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>Demo</a>
          <a href="/verify" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>Verify</a>
          <a href="https://github.com/MorkeethHQ/receipt" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'Inter, sans-serif' }}>GitHub</a>
        </div>
      </nav>

      {/* Demo Sub-Header */}
      <header style={{
        padding: '0.5rem 1.5rem', borderBottom: '1px solid var(--border)',
        background: adversarial && phase === 'running' ? '#fef8f8' : 'var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, transition: 'background 0.3s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>Live Demo</h1>
            <p style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>
              {phase === 'idle' ? 'Choose a mode and start' :
                phase === 'running' ? `Running ${adversarial ? '— catching the lie' : '— watching agents generate receipts'}` :
                  fabricationDetected ? 'Complete — fabrication detected and rejected' :
                    qualityRejected ? 'Complete — quality gate rejected the chain' :
                    'Complete — all receipts verified'}
            </p>
          </div>
        </div>
        <div className="demo-header-badges" style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          {/* AXL status during run */}
          {phase !== 'idle' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.3rem 0.6rem', borderRadius: '6px',
              background: axlStatus.researcher && axlStatus.builder ? '#f0fdf4' : 'var(--surface)',
              border: `1px solid ${axlStatus.researcher && axlStatus.builder ? '#bbf7d0' : 'var(--border)'}`,
            }}>
              <div style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: axlStatus.researcher && axlStatus.builder ? 'var(--green)' : 'var(--text-dim)',
                boxShadow: axlStatus.researcher && axlStatus.builder ? '0 0 5px rgba(34,197,94,0.4)' : 'none',
              }} />
              <span style={{ ...mono, fontSize: '0.55rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                AXL {axlStatus.researcher && axlStatus.builder ? 'LIVE' : 'DIRECT'}
              </span>
            </div>
          )}
          {/* Inline adversarial toggle for header (during run) */}
          {phase !== 'idle' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.3rem 0.6rem', borderRadius: '6px',
              background: adversarial ? '#fef2f2' : '#f0fdf4',
              border: `1px solid ${adversarial ? '#fecaca' : '#bbf7d0'}`,
            }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: adversarial ? 'var(--red)' : 'var(--green)',
              }} />
              <span style={{
                ...mono, fontSize: '0.6rem', fontWeight: 600,
                color: adversarial ? 'var(--red)' : 'var(--green)',
              }}>
                {adversarial ? 'CATCHING LIE' : 'HONEST'}
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
          padding: chapterPause ? '0.5rem 1.5rem' : '0.5rem 1.5rem',
          borderBottom: `1px solid ${chapterPause ? 'var(--researcher)' : 'var(--border)'}`,
          background: chapterPause ? '#f0f4ff' : fabricationDetected ? '#fef2f2' : 'var(--surface)',
          transition: 'all 0.3s',
          flexShrink: 0,
          minHeight: '36px',
          maxHeight: chapterPause ? '60px' : '50px',
          overflow: 'hidden',
        }}>
          {chapterPause ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', maxWidth: '900px' }}>
              <span style={{
                ...mono, fontSize: '0.55rem', fontWeight: 700,
                padding: '0.15rem 0.4rem', borderRadius: '4px',
                background: 'var(--researcher)', color: '#fff',
                flexShrink: 0,
              }}>
                {chapterPause.chapter}/5
              </span>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)' }}>
                  {chapterPause.title}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '0.6rem' }}>
                  {chapterPause.body}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                <button
                  onClick={() => { setChapterPause(null); resumeRef.current?.(); }}
                  style={{
                    padding: '0.35rem 1rem', borderRadius: '6px', border: 'none',
                    background: 'var(--text)', color: '#fff', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600,
                  }}
                >
                  Continue
                </button>
                <button
                  onClick={() => { guidedRef.current = false; setGuidedMode(false); setChapterPause(null); resumeRef.current?.(); }}
                  style={{
                    padding: '0.35rem 0.7rem', borderRadius: '6px',
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--text-dim)', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: '0.65rem', fontWeight: 500,
                  }}
                >
                  Skip
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '0.78rem', lineHeight: 1.5,
                  color: fabricationDetected ? 'var(--red)' : 'var(--text)',
                  fontWeight: narrativeHighlight ? 500 : 400,
                  transition: 'font-weight 0.3s',
                  maxWidth: '700px',
                  minHeight: '20px',
                }}>
                  {narrative}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '180px' }}>
                <div style={{ flex: 1, height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${verifications.length > 0 ? ((verificationsPassedCount / verifications.length) * 100) : (receipts.length > 0 ? 100 : 0)}%`,
                    background: fabricationDetected ? 'var(--red)' : 'var(--green)',
                    borderRadius: '2px',
                    transition: 'width 0.5s ease, background 0.3s ease',
                  }} />
                </div>
                <span style={{ ...mono, fontSize: '0.55rem', color: fabricationDetected ? 'var(--red)' : verifications.length > 0 ? 'var(--green)' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                  {verifications.length > 0 ? `${verificationsPassedCount}/${verifications.length} verified` : `${receipts.length} receipts`}
                </span>
              </div>
            </div>
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
