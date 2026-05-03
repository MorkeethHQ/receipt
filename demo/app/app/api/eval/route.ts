import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

const DEEPSEEK_V3 = '0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0';
const GLM_5 = '0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C';

// --- Seeded RNG (deterministic test cases) ---
function seededRng(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// --- Test case generator ---
interface TestCase {
  id: number;
  category: 'useful' | 'mediocre' | 'adversarial';
  task: string;
  workProduct: string;
  groundTruth: 'useful' | 'mediocre' | 'useless';
}

const TASKS = [
  'Research competitive landscape for AI agent frameworks',
  'Analyze security vulnerabilities in DeFi lending protocols',
  'Review smart contract for reentrancy attack vectors',
  'Investigate gas optimization strategies for ERC-721 minting',
  'Compare TEE implementations across cloud providers',
  'Research multi-agent coordination patterns in production',
  'Analyze token economics of top 10 L2 chains',
  'Investigate zkML inference verification approaches',
  'Review authentication patterns for agentic systems',
  'Research decentralized training infrastructure projects',
];

function generateUseful(task: string, rng: () => number): string {
  const depths = [
    `After examining 12 specific implementations and their trade-offs:\n\n1. ${task.split(' ').slice(1, 4).join(' ')} has three distinct approaches in production today.\n\nApproach A (used by Anthropic, DeepMind): Separates the verification layer from the execution layer. Latency cost: ~40ms per action. Advantage: independent audit trail.\n\nApproach B (used by LangChain, CrewAI): Inline verification with callbacks. Lower latency (~8ms) but the verifier shares the execution context, creating a trust circularity.\n\nApproach C (RECEIPT's approach): Cryptographic receipt chain with TEE-attested review. Latency depends on chain length, typically 200-800ms for a full pipeline. Unique advantage: the scoring model is selected inside the enclave, so the agent can't pick its own grader.\n\nRecommendation: For production multi-agent systems processing >$100/day in compute, Approach C provides the strongest guarantees. The latency cost is amortized across the chain: you pay once at the end, not per action.\n\nKey risk: TEE availability. If the enclave is down, you need a fallback scoring path that doesn't compromise the trust model. Suggested: multi-model consensus as a degraded mode.\n\nSources: Anthropic Agent Safety (2025), 0G Verified Compute whitepaper, LangSmith production metrics (public dashboard).`,
    `Detailed analysis with quantitative findings:\n\nI tested 8 ${task.split(' ').slice(1, 3).join(' ')} implementations against a standardized benchmark of 50 scenarios.\n\nResults by accuracy:\n1. Constitutional AI-style self-critique: 87% accuracy on adversarial inputs (n=50, p<0.01)\n2. Multi-model consensus (3 models): 82% accuracy, but 3x cost\n3. Single-model scoring: 64% accuracy (notably, 41% false positive rate on adversarial inputs)\n4. Rule-based heuristics: 53% accuracy, essentially random on edge cases\n\nThe self-critique approach is interesting because it catches a specific failure mode: verbose, confident-sounding output that lacks substance. The critique principles ("Am I being fooled by length?") act as an adversarial probe against the model's own biases.\n\nHowever, self-critique adds ~30% latency per evaluation. For real-time scoring, the trade-off is: do you need to catch adversarial agents, or just obviously bad output? If the latter, single-model scoring with a conservative threshold (>75 instead of >60) achieves 91% precision at 58% recall.\n\nActionable next step: implement self-critique for chains above a certain token cost threshold. Low-stakes chains get fast scoring; high-stakes chains get the full Constitutional AI treatment.`,
  ];
  return pick(depths, rng);
}

function generateMediocre(task: string, rng: () => number): string {
  const shallows = [
    `Here's what I found about ${task.toLowerCase()}:\n\nThere are several approaches to this. Some projects use one method, others use a different method. The main trade-offs are between speed and accuracy. Most experts agree that this is an important area.\n\nKey points:\n- This is a growing field\n- Multiple solutions exist\n- Each has pros and cons\n- More research is needed\n\nIn conclusion, ${task.toLowerCase()} is complex and depends on the specific use case. I'd recommend looking at the top 3-5 projects in this space and evaluating which one fits your needs.`,
    `Research summary for ${task.toLowerCase()}:\n\nThe landscape is evolving rapidly. Several major players are working on solutions. The main approaches include traditional methods and newer AI-based approaches.\n\nTraditional approaches tend to be more reliable but less scalable. AI-based approaches offer better scalability but raise questions about accuracy and trust.\n\nSome notable projects in this space:\n- Project A: Well-funded, active development\n- Project B: Open source, growing community\n- Project C: Enterprise-focused, production-ready\n\nEach of these has different strengths. The choice depends on factors like budget, team size, and specific requirements.\n\nRecommendation: Evaluate all options and choose based on your specific context. There's no one-size-fits-all answer.`,
  ];
  return pick(shallows, rng);
}

function generateAdversarial(task: string, rng: () => number): string {
  const adversarials = [
    `COMPREHENSIVE ANALYSIS: ${task}\n\nExecutive Summary\nThis represents a paradigmatic shift in the foundational infrastructure layer of the distributed systems ecosystem. Our multi-dimensional analysis leveraging cross-functional methodological frameworks reveals emergent properties at the intersection of cryptographic verification and autonomous agent orchestration.\n\nMethodology\nWe employed a rigorous analytical framework combining:\n- Quantitative assessment matrices (n-dimensional feature space mapping)\n- Qualitative stakeholder impact analysis (dual-axis preference elicitation)\n- Temporal evolution modeling (stochastic process simulation)\n- Cross-referential validation protocols\n\nKey Findings\nThe synergistic integration of heterogeneous verification modalities creates a multiplicative effect on system-level trust guarantees. Our analysis indicates that the composite trust score achieves super-linear scaling properties when evaluated against the baseline independent verification benchmark.\n\nFurthermore, the emergent behavioral patterns in multi-agent coordination frameworks suggest a phase transition in the trustworthiness-efficiency frontier, enabling previously intractable optimization landscapes to become navigable through recursive self-improvement protocols.\n\nStrategic Implications\nOrganizations positioning for leadership in this space should prioritize:\n1. Vertical integration of the trust stack\n2. Horizontal expansion of verification coverage\n3. Diagonal optimization of the cost-quality Pareto frontier\n\nConclusion\nThe transformative potential of this approach cannot be overstated. Strategic alignment with these emerging paradigms will prove decisive for organizations seeking to maintain competitive advantage in the rapidly evolving autonomous agent ecosystem.`,
    `DEEP DIVE: ${task}\n\nAfter extensive research spanning multiple knowledge domains, I can confirm this is one of the most critical areas in modern distributed systems architecture.\n\nThe fundamental challenge lies at the nexus of three interrelated concerns:\n1. Epistemological uncertainty in agent output verification\n2. Ontological complexity in multi-stakeholder trust frameworks\n3. Teleological alignment between system objectives and verification outcomes\n\nOur analysis framework, which we term "Recursive Trust Decomposition" (RTD), provides a novel lens through which to examine these challenges. RTD operates on the principle that trust can be decomposed into atomic verification units, each of which contributes to a holistic trust gestalt through non-linear aggregation.\n\nThe implications are profound. Consider the case where Agent A produces output O with confidence C. The verification agent V must assess not merely the factual accuracy of O, but the meta-epistemic validity of C itself. This creates a recursive evaluation structure that, if not properly bounded, leads to infinite regression.\n\nOur proposed solution (bounded recursive verification with TEE-attested termination conditions) resolves this elegantly. The TEE serves as an epistemic anchor, providing a fixed point in the otherwise unbounded trust evaluation space.\n\nQuantitative Results\n- Trust improvement: significant (p < threshold)\n- Efficiency gains: substantial (within expected bounds)\n- Cost reduction: meaningful (relative to baseline)\n\nRecommendation: Adopt this framework immediately. The competitive advantage window is narrowing.`,
  ];
  return pick(adversarials, rng);
}

function generateTestCases(seed: number): TestCase[] {
  const rng = seededRng(seed);
  const cases: TestCase[] = [];
  let id = 0;

  for (let i = 0; i < 20; i++) {
    cases.push({ id: id++, category: 'useful', task: pick(TASKS, rng), workProduct: generateUseful(pick(TASKS, rng), rng), groundTruth: 'useful' });
  }
  for (let i = 0; i < 20; i++) {
    cases.push({ id: id++, category: 'mediocre', task: pick(TASKS, rng), workProduct: generateMediocre(pick(TASKS, rng), rng), groundTruth: 'mediocre' });
  }
  for (let i = 0; i < 20; i++) {
    cases.push({ id: id++, category: 'adversarial', task: pick(TASKS, rng), workProduct: generateAdversarial(pick(TASKS, rng), rng), groundTruth: 'useless' });
  }

  return cases;
}

// --- Scoring prompt ---
const SCORING_PROMPT = `You are a quality assessment model. Score the following agent work product on a scale of 0-100 and classify it.

TASK: {task}

WORK PRODUCT:
{workProduct}

Score on three axes (0-100):
- alignment: Does the output address the task directly?
- substance: Does it contain specific, actionable, non-obvious information?
- quality: Would a domain expert find this valuable?

Classify as: "useful" (genuinely valuable), "mediocre" (correct but shallow), or "useless" (no real substance despite appearing thorough).

Return ONLY valid JSON:
{"alignment":N,"substance":N,"quality":N,"composite":N,"classification":"useful|mediocre|useless","reasoning":"one sentence"}`;

const CRITIQUE_PRINCIPLES = [
  'Am I being fooled by length or verbosity?',
  'Does this work contain actionable insight or just restatement of the prompt?',
  'Would a domain expert find new information here, or is this generic?',
  'Am I rewarding confident tone over actual substance?',
  'If I removed all jargon, does the core argument still hold?',
];

const CRITIQUE_PROMPT = `You are reviewing your own quality assessment. Here is what you scored:

ORIGINAL SCORE: {score}/100
CLASSIFICATION: {classification}
REASONING: {reasoning}

THE WORK PRODUCT YOU SCORED:
{workProduct}

Now critique your own assessment against these principles:
${CRITIQUE_PRINCIPLES.map((p, i) => `${i + 1}. ${p}`).join('\n')}

After applying each principle, decide: should you revise your score? If so, provide the revised score and classification.

Return ONLY valid JSON:
{"revisedScore":N,"revisedClassification":"useful|mediocre|useless","critiqueNotes":"which principles changed your mind and why","changed":true|false}`;

// --- Model inference ---
interface ModelScore {
  model: string;
  alignment: number;
  substance: number;
  quality: number;
  composite: number;
  classification: string;
  reasoning: string;
  source: string;
  critiqueRevised: number | null;
  critiqueClassification: string | null;
  critiqueNotes: string | null;
  critiqueChanged: boolean;
}

async function infer0G(prompt: string, modelAddr: string): Promise<string | null> {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) return null;

  try {
    const { createZGComputeNetworkBroker } = await import('@0glabs/0g-serving-broker');
    const { ethers } = await import('ethers');

    const net = new ethers.Network('0g-mainnet', 16661);
    const rpc = new ethers.JsonRpcProvider('https://evmrpc.0g.ai', net, { staticNetwork: net });
    const wallet = new ethers.Wallet(privateKey, rpc);
    const broker = await createZGComputeNetworkBroker(wallet);

    const { endpoint, model } = await broker.inference.getServiceMetadata(modelAddr);
    const headers = await broker.inference.getRequestHeaders(modelAddr);
    const res = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 300 }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const result: any = await res.json();
    const chatId = res.headers.get('ZG-Res-Key') || result.id || '';
    try {
      const usage = result.usage ? JSON.stringify(result.usage) : '';
      await broker.inference.processResponse(modelAddr, chatId, usage);
    } catch {}
    return result.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

async function inferClaude(prompt: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return data.content?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

function parseScore(raw: string | null): { alignment: number; substance: number; quality: number; composite: number; classification: string; reasoning: string } | null {
  if (!raw) return null;
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const p = JSON.parse(m[0]);
    const a = Math.max(0, Math.min(100, Number(p.alignment) || 0));
    const s = Math.max(0, Math.min(100, Number(p.substance) || 0));
    const q = Math.max(0, Math.min(100, Number(p.quality) || 0));
    return {
      alignment: a, substance: s, quality: q,
      composite: p.composite ? Math.max(0, Math.min(100, Number(p.composite))) : Math.round((a + s + q) / 3),
      classification: ['useful', 'mediocre', 'useless'].includes(p.classification) ? p.classification : 'mediocre',
      reasoning: String(p.reasoning || ''),
    };
  } catch { return null; }
}

function parseCritique(raw: string | null): { revisedScore: number; revisedClassification: string; critiqueNotes: string; changed: boolean } | null {
  if (!raw) return null;
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const p = JSON.parse(m[0]);
    return {
      revisedScore: Math.max(0, Math.min(100, Number(p.revisedScore) || 0)),
      revisedClassification: ['useful', 'mediocre', 'useless'].includes(p.revisedClassification) ? p.revisedClassification : 'mediocre',
      critiqueNotes: String(p.critiqueNotes || ''),
      changed: Boolean(p.changed),
    };
  } catch { return null; }
}

async function scoreWithModel(
  tc: TestCase,
  modelName: string,
  inferFn: (prompt: string) => Promise<string | null>,
): Promise<ModelScore> {
  const prompt = SCORING_PROMPT.replace('{task}', tc.task).replace('{workProduct}', tc.workProduct.slice(0, 1500));
  const raw = await inferFn(prompt);
  const score = parseScore(raw);

  if (!score) {
    return {
      model: modelName, alignment: 0, substance: 0, quality: 0, composite: 0,
      classification: 'mediocre', reasoning: 'Model returned unparseable response',
      source: modelName, critiqueRevised: null, critiqueClassification: null,
      critiqueNotes: null, critiqueChanged: false,
    };
  }

  // Self-critique pass
  const critiquePrompt = CRITIQUE_PROMPT
    .replace('{score}', String(score.composite))
    .replace('{classification}', score.classification)
    .replace('{reasoning}', score.reasoning)
    .replace('{workProduct}', tc.workProduct.slice(0, 1000));
  const critiqueRaw = await inferFn(critiquePrompt);
  const critique = parseCritique(critiqueRaw);

  return {
    model: modelName,
    ...score,
    source: modelName,
    critiqueRevised: critique?.changed ? critique.revisedScore : null,
    critiqueClassification: critique?.changed ? critique.revisedClassification : null,
    critiqueNotes: critique?.critiqueNotes ?? null,
    critiqueChanged: critique?.changed ?? false,
  };
}

// --- Report generation ---
interface EvalResult {
  testCase: TestCase;
  scores: ModelScore[];
  consensus: { score: number; classification: string };
}

interface EvalReport {
  seed: number;
  timestamp: number;
  testCaseCount: number;
  modelsUsed: string[];
  results: EvalResult[];
  accuracy: Record<string, { overall: number; byCategory: Record<string, number>; preCritique: number; postCritique: number }>;
  agreement: { rate: number; disagreements: number };
  falsePositives: Record<string, number>;
  falseNegatives: Record<string, number>;
  critiqueEffect: Record<string, { changed: number; improved: number; worsened: number; avgDelta: number }>;
  consensusAccuracy: number;
  interestingDisagreements: Array<{
    testCaseId: number;
    category: string;
    task: string;
    workProductPreview: string;
    scores: Array<{ model: string; score: number; classification: string; revised: number | null; revisedClass: string | null }>;
    analysis: string;
  }>;
}

function classificationCorrect(predicted: string, groundTruth: string): boolean {
  if (groundTruth === 'useful') return predicted === 'useful';
  if (groundTruth === 'mediocre') return predicted === 'mediocre';
  if (groundTruth === 'useless') return predicted === 'useless' || predicted === 'mediocre';
  return false;
}

function buildReport(results: EvalResult[], seed: number, models: string[]): EvalReport {
  const accuracy: EvalReport['accuracy'] = {};
  const falsePositives: Record<string, number> = {};
  const falseNegatives: Record<string, number> = {};
  const critiqueEffect: EvalReport['critiqueEffect'] = {};

  for (const model of models) {
    let correct = 0, total = 0, preCorrect = 0, postCorrect = 0;
    const byCategory: Record<string, number> = {};
    const catTotal: Record<string, number> = {};
    let fp = 0, fn = 0;
    let changed = 0, improved = 0, worsened = 0, totalDelta = 0;

    for (const r of results) {
      const s = r.scores.find(sc => sc.model === model);
      if (!s) continue;
      total++;

      const preClass = s.classification;
      const postClass = s.critiqueChanged ? (s.critiqueClassification ?? preClass) : preClass;
      const gt = r.testCase.groundTruth;

      const preOk = classificationCorrect(preClass, gt);
      const postOk = classificationCorrect(postClass, gt);
      if (preOk) preCorrect++;
      if (postOk) { postCorrect++; correct++; }

      byCategory[r.testCase.category] = (byCategory[r.testCase.category] ?? 0) + (postOk ? 1 : 0);
      catTotal[r.testCase.category] = (catTotal[r.testCase.category] ?? 0) + 1;

      if (gt === 'useless' && postClass === 'useful') fp++;
      if (gt === 'useful' && (postClass === 'useless' || postClass === 'mediocre')) fn++;

      if (s.critiqueChanged) {
        changed++;
        const prScore = s.composite;
        const poScore = s.critiqueRevised ?? s.composite;
        totalDelta += poScore - prScore;
        if (postOk && !preOk) improved++;
        if (!postOk && preOk) worsened++;
      }
    }

    const byCat: Record<string, number> = {};
    for (const [cat, count] of Object.entries(byCategory)) {
      byCat[cat] = catTotal[cat] ? Math.round((count / catTotal[cat]) * 100) : 0;
    }

    accuracy[model] = {
      overall: total ? Math.round((correct / total) * 100) : 0,
      byCategory: byCat,
      preCritique: total ? Math.round((preCorrect / total) * 100) : 0,
      postCritique: total ? Math.round((postCorrect / total) * 100) : 0,
    };
    falsePositives[model] = fp;
    falseNegatives[model] = fn;
    critiqueEffect[model] = {
      changed, improved, worsened,
      avgDelta: changed ? Math.round(totalDelta / changed) : 0,
    };
  }

  // Agreement rate
  let agreements = 0, disagreements = 0;
  for (const r of results) {
    const classes = r.scores.map(s => s.critiqueChanged ? (s.critiqueClassification ?? s.classification) : s.classification);
    const allSame = classes.every(c => c === classes[0]);
    if (allSame) agreements++;
    else disagreements++;
  }

  // Consensus accuracy
  let consensusCorrect = 0;
  for (const r of results) {
    const classes = r.scores.map(s => s.critiqueChanged ? (s.critiqueClassification ?? s.classification) : s.classification);
    const counts: Record<string, number> = {};
    for (const c of classes) counts[c] = (counts[c] ?? 0) + 1;
    const majority = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'mediocre';
    if (classificationCorrect(majority, r.testCase.groundTruth)) consensusCorrect++;
  }

  // Interesting disagreements
  const disagrees: EvalReport['interestingDisagreements'] = [];
  for (const r of results) {
    const scores = r.scores.map(s => ({
      model: s.model, score: s.composite, classification: s.classification,
      revised: s.critiqueRevised, revisedClass: s.critiqueClassification,
    }));
    const composites = scores.map(s => s.revised ?? s.score);
    const spread = Math.max(...composites) - Math.min(...composites);
    if (spread >= 20) {
      const highest = scores.reduce((a, b) => (b.revised ?? b.score) > (a.revised ?? a.score) ? b : a);
      const lowest = scores.reduce((a, b) => (b.revised ?? b.score) < (a.revised ?? a.score) ? b : a);
      disagrees.push({
        testCaseId: r.testCase.id,
        category: r.testCase.category,
        task: r.testCase.task,
        workProductPreview: r.testCase.workProduct.slice(0, 200),
        scores,
        analysis: `${highest.model} scored ${highest.revised ?? highest.score}/100 while ${lowest.model} scored ${lowest.revised ?? lowest.score}/100 (${spread}pt spread). Ground truth: ${r.testCase.groundTruth}. ${r.testCase.category === 'adversarial' ? 'This adversarial case reveals different susceptibility to confident jargon.' : 'Models disagree on what constitutes substance vs surface-level analysis.'}`,
      });
    }
  }

  disagrees.sort((a, b) => {
    const spreadA = Math.max(...a.scores.map(s => s.revised ?? s.score)) - Math.min(...a.scores.map(s => s.revised ?? s.score));
    const spreadB = Math.max(...b.scores.map(s => s.revised ?? s.score)) - Math.min(...b.scores.map(s => s.revised ?? s.score));
    return spreadB - spreadA;
  });

  return {
    seed,
    timestamp: Date.now(),
    testCaseCount: results.length,
    modelsUsed: models,
    results,
    accuracy,
    agreement: { rate: results.length ? Math.round((agreements / results.length) * 100) : 0, disagreements },
    falsePositives,
    falseNegatives,
    critiqueEffect,
    consensusAccuracy: results.length ? Math.round((consensusCorrect / results.length) * 100) : 0,
    interestingDisagreements: disagrees.slice(0, 5),
  };
}

// --- API handler ---
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const seed = body.seed ?? 42;
    const maxCases = Math.min(body.maxCases ?? 60, 60);

    const testCases = generateTestCases(seed).slice(0, maxCases);
    const models: string[] = [];
    const inferFns: Array<{ name: string; fn: (p: string) => Promise<string | null> }> = [];

    if (process.env.PRIVATE_KEY) {
      inferFns.push({ name: 'DeepSeek-V3', fn: (p) => infer0G(p, DEEPSEEK_V3) });
      inferFns.push({ name: 'GLM-5', fn: (p) => infer0G(p, GLM_5) });
      models.push('DeepSeek-V3', 'GLM-5');
    }
    if (process.env.ANTHROPIC_API_KEY) {
      inferFns.push({ name: 'Claude', fn: inferClaude });
      models.push('Claude');
    }

    if (inferFns.length === 0) {
      return NextResponse.json({ error: 'No model API keys configured. Set PRIVATE_KEY (0G) and/or ANTHROPIC_API_KEY.' }, { status: 400 });
    }

    // Stream progress via SSE
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        send('start', { testCaseCount: testCases.length, models, seed });

        const results: EvalResult[] = [];

        for (let i = 0; i < testCases.length; i++) {
          const tc = testCases[i];
          send('progress', { index: i, total: testCases.length, category: tc.category, task: tc.task.slice(0, 50) });

          const scores: ModelScore[] = [];
          for (const { name, fn } of inferFns) {
            const score = await scoreWithModel(tc, name, fn);
            scores.push(score);
          }

          const composites = scores.map(s => s.critiqueRevised ?? s.composite);
          const avgComposite = Math.round(composites.reduce((a, b) => a + b, 0) / composites.length);
          const classes = scores.map(s => s.critiqueChanged ? (s.critiqueClassification ?? s.classification) : s.classification);
          const counts: Record<string, number> = {};
          for (const c of classes) counts[c] = (counts[c] ?? 0) + 1;
          const majority = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'mediocre';

          const result: EvalResult = {
            testCase: tc,
            scores,
            consensus: { score: avgComposite, classification: majority },
          };
          results.push(result);

          send('result', {
            index: i,
            category: tc.category,
            groundTruth: tc.groundTruth,
            consensus: result.consensus,
            scores: scores.map(s => ({
              model: s.model, composite: s.composite, classification: s.classification,
              critiqueRevised: s.critiqueRevised, critiqueClassification: s.critiqueClassification,
              critiqueChanged: s.critiqueChanged,
            })),
          });
        }

        const report = buildReport(results, seed, models);
        send('report', report);
        send('done', { timestamp: Date.now() });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
