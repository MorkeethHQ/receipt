/**
 * Wrap OpenClaw with RECEIPT — real agent, real receipts.
 *
 * This shows how to wrap a tool-using agent at its action boundaries.
 * Replace the simulated calls with your actual OpenClaw logic.
 *
 * Run: npx tsx examples/wrap-openclaw.ts
 */

import { createAgentRun, wrapTool } from 'agenticproof';

// --- Your existing tools (replace with real implementations) ---

async function searchCode(input: { query: string; repo: string }) {
  // Simulated — replace with real code search
  return {
    files: ['src/vault.sol', 'src/token.sol'],
    matches: 3,
    snippet: 'function withdraw() external { ... }',
  };
}

async function analyzeContract(input: { path: string; focus: string }) {
  // Simulated — replace with real LLM analysis
  return {
    vulnerabilities: [],
    gasOptimizations: ['Use unchecked in loop counter'],
    verdict: 'No critical issues. One gas optimization suggested.',
  };
}

// --- The wrapper (this is what you add to OpenClaw) ---

async function runOpenClawTurn() {
  const run = createAgentRun({
    agentId: 'openclaw',
    sessionId: 'audit-session-001',
  });

  // 1. Read context — what does the agent know before acting?
  run.contextRead('task', 'Audit Solidity contracts in vault-protocol repo for reentrancy');
  run.contextRead('memory', JSON.stringify({
    priorAudits: ['token.sol — clean', 'staking.sol — one medium'],
    knownPatterns: ['CEI pattern', 'pull-over-push'],
  }));

  // 2. Wrap existing tools — every call/result gets receipted automatically
  const search = wrapTool(run, 'search_code', searchCode);
  const analyze = wrapTool(run, 'analyze_contract', analyzeContract);

  // 3. Agent does its work (your existing logic, unchanged)
  const searchResults = await search({ query: 'reentrancy withdraw', repo: 'vault-protocol' });
  const analysis = await analyze({ path: 'src/vault.sol', focus: 'reentrancy' });

  // 4. Decision
  run.decision(
    `Searched ${searchResults.matches} matches across ${searchResults.files.length} files. Analysis: ${analysis.verdict}`,
    'No critical vulnerabilities. Recommend gas optimization in loop counters.',
  );

  // 5. Final message
  run.messageSend('user', [
    'Audit complete for vault-protocol.',
    `Files reviewed: ${searchResults.files.join(', ')}`,
    `Verdict: ${analysis.verdict}`,
    `Gas optimizations: ${analysis.gasOptimizations.join('; ')}`,
  ].join('\n'));

  // 6. Finalize — get the chain
  const chain = run.finalize();

  console.log(`Run: ${chain.runId}`);
  console.log(`Receipts: ${chain.receipts.length}`);
  console.log(`Valid: ${chain.valid}`);
  console.log(`Root: ${chain.rootHash}`);
  console.log(`Public key: ${chain.publicKey.slice(0, 32)}...`);
  console.log('');

  for (const r of chain.receipts) {
    console.log(`  [${r.action.type}] ${r.action.description.slice(0, 60)}`);
  }

  return chain;
}

runOpenClawTurn().catch(console.error);
