const { ReceiptAgent, verifyChain } = require('../packages/receipt-sdk/dist');
const fs = require('fs');
const path = require('path');

function generateChain(agentName, source, scenario) {
  const researcher = ReceiptAgent.create(`${agentName}-researcher`);
  const tasks = scenario.tasks;

  for (const task of tasks) {
    switch (task.type) {
      case 'file_read':
        researcher.readFile(task.path, task.content);
        break;
      case 'api_call':
        researcher.callApi(task.endpoint, task.response);
        break;
      case 'llm_call':
        researcher.callLlm(task.prompt, task.response);
        break;
      case 'decision':
        researcher.decide(task.reasoning, task.decision);
        break;
      case 'tool_call':
        researcher.toolCall(task.tool, task.input);
        break;
      case 'tool_result':
        researcher.toolResult(task.tool, task.result);
        break;
      case 'context_read':
        researcher.contextRead(task.source, task.content);
        break;
      case 'output':
        researcher.produceOutput(task.desc, task.output);
        break;
    }
  }

  const builder = ReceiptAgent.continueFrom(researcher.getReceipts());
  builder.readFile('verification-context.md', 'Verifying chain integrity before proceeding');
  builder.callApi('chain-verify', JSON.stringify({ valid: true, receipts: researcher.getReceipts().length }));
  builder.decide('All receipts verified, signatures valid, hash chain intact', 'Chain accepted');

  const quality = scenario.quality;
  builder.reviewUsefulness(
    `Chain summary: ${scenario.description}`,
    JSON.stringify({ alignment: quality.alignment, substance: quality.substance, quality: quality.quality, composite: quality.composite, reasoning: quality.reasoning })
  );

  const receipts = builder.getReceipts();
  const rootHash = receipts[receipts.length - 1].outputHash;
  const valid = verifyChain(receipts, researcher.getPublicKey());
  const allValid = valid.slice(0, researcher.getReceipts().length).every(r => r.valid);

  const ts = Date.now() - Math.floor(Math.random() * 86400000 * 3);

  return {
    id: `seed-${source}-${ts}`,
    source,
    agentId: agentName,
    receiptCount: receipts.length,
    rootHash,
    quality: quality.composite,
    timestamp: ts,
    receipts: receipts.map(r => ({
      ...r,
      previousReceiptId: r.prevId,
    })),
  };
}

const scenarios = [
  {
    name: 'cursor-code-review',
    source: 'cursor',
    agent: 'cursor-agent-v2',
    description: 'Code review of authentication module',
    quality: { alignment: 85, substance: 78, quality: 82, composite: 82, reasoning: 'Thorough review of auth module. Identified 2 critical issues and suggested concrete fixes.' },
    tasks: [
      { type: 'context_read', source: 'workspace', content: 'Project: vault-protocol, Language: Solidity, Framework: Hardhat' },
      { type: 'file_read', path: 'contracts/Auth.sol', content: 'pragma solidity ^0.8.19;\n\ncontract Auth {\n  mapping(address => bool) public authorized;\n  function setAuth(address user, bool status) external {\n    require(msg.sender == owner, "not owner");\n    authorized[user] = status;\n  }\n}' },
      { type: 'file_read', path: 'contracts/Vault.sol', content: 'pragma solidity ^0.8.19;\n\ncontract Vault {\n  function withdraw(uint256 amount) external {\n    require(auth.authorized(msg.sender));\n    (bool ok, ) = msg.sender.call{value: amount}("");\n    require(ok);\n    balances[msg.sender] -= amount;\n  }\n}' },
      { type: 'llm_call', prompt: 'Review Vault.sol for security vulnerabilities', response: 'Critical: Reentrancy vulnerability in withdraw(). State update (balances decrement) happens after external call. Recommendation: Follow checks-effects-interactions pattern or use ReentrancyGuard.' },
      { type: 'tool_call', tool: 'slither', input: 'contracts/Vault.sol' },
      { type: 'tool_result', tool: 'slither', result: 'Reentrancy vulnerability detected in Vault.withdraw() [HIGH]. Unchecked return value [MEDIUM].' },
      { type: 'decision', reasoning: 'Confirmed reentrancy via static analysis. Auth module is sound.', decision: 'Flag Vault.sol for immediate fix. Auth.sol passes review.' },
      { type: 'output', desc: 'Code review report', output: JSON.stringify({ critical: 1, high: 1, medium: 0, files_reviewed: 2, recommendation: 'Fix reentrancy before deployment' }) },
    ],
  },
  {
    name: 'openclaw-data-pipeline',
    source: 'openclaw',
    agent: 'openclaw-pipeline',
    description: 'ETL pipeline for blockchain analytics',
    quality: { alignment: 90, substance: 88, quality: 75, composite: 84, reasoning: 'Pipeline executed correctly. Data quality high. Output formatting could be improved.' },
    tasks: [
      { type: 'context_read', source: 'task-queue', content: 'Task: Analyze top 100 0G Mainnet transactions by gas usage' },
      { type: 'api_call', endpoint: 'https://chainscan-api.0g.ai/api/txlist?sort=gas_desc&limit=100', response: JSON.stringify({ status: '1', result: Array.from({length: 5}, (_, i) => ({ hash: `0x${(i+1).toString(16).padStart(64, 'a')}`, gas: 500000 - i * 50000, from: `0x${'b'.repeat(40)}`, to: `0x${'c'.repeat(40)}` })) }) },
      { type: 'tool_call', tool: 'pandas_analyze', input: 'Calculate gas distribution percentiles for top 100 txs' },
      { type: 'tool_result', tool: 'pandas_analyze', result: JSON.stringify({ p50: 180000, p90: 420000, p99: 890000, mean: 245000, total_gas: 24500000 }) },
      { type: 'llm_call', prompt: 'Summarize gas usage patterns on 0G Mainnet', response: 'Gas usage on 0G Mainnet shows a heavy-tail distribution. Median transaction uses 180K gas, but the top 1% consume 890K+. This suggests contract deployments and complex DeFi interactions dominate high-gas transactions. Recommendation: monitor p99 for network congestion signals.' },
      { type: 'decision', reasoning: 'Analysis complete, data quality verified against block explorer', decision: 'Publish report to dashboard' },
      { type: 'output', desc: 'Gas analysis report', output: JSON.stringify({ network: '0G Mainnet', txs_analyzed: 100, median_gas: 180000, p99_gas: 890000, report_status: 'published' }) },
    ],
  },
  {
    name: 'claude-code-refactor',
    source: 'claude-code',
    agent: 'claude-code-session',
    description: 'Refactor receipt chain verification for performance',
    quality: { alignment: 92, substance: 85, quality: 90, composite: 89, reasoning: 'Excellent refactoring. Reduced verification time by 60%. Clean code, good test coverage.' },
    tasks: [
      { type: 'file_read', path: 'packages/receipt-sdk/src/verify.ts', content: 'export function verifyChain(receipts, publicKey) {\n  return receipts.map((r, i) => {\n    const prev = i > 0 ? receipts[i-1] : null;\n    return verifyReceipt(r, publicKey, prev);\n  });\n}' },
      { type: 'file_read', path: 'packages/receipt-sdk/src/__tests__/verify.test.ts', content: 'describe("verifyChain", () => { it("verifies valid chain", () => { ... }) })' },
      { type: 'llm_call', prompt: 'Optimize verifyChain for large chains (1000+ receipts)', response: 'Batch signature verification using parallel Promise.all. Pre-compute hash chain in single pass. Use typed arrays for hash comparison instead of string comparison. Expected improvement: 3-5x for chains over 100 receipts.' },
      { type: 'tool_call', tool: 'Edit', input: 'packages/receipt-sdk/src/verify.ts' },
      { type: 'tool_result', tool: 'Edit', result: 'File updated: parallel verification with Promise.all, typed array hash comparison' },
      { type: 'tool_call', tool: 'Bash', input: 'npm test -- --filter verify' },
      { type: 'tool_result', tool: 'Bash', result: '47 tests passing (0.8s). Benchmark: 1000-receipt chain verified in 120ms (was 340ms).' },
      { type: 'decision', reasoning: '60% performance improvement confirmed. All tests pass. No API changes.', decision: 'Commit refactored verify module' },
      { type: 'output', desc: 'Refactoring summary', output: JSON.stringify({ files_changed: 1, tests_passing: 47, perf_improvement: '60%', breaking_changes: false }) },
    ],
  },
  {
    name: 'demo-adversarial-caught',
    source: 'demo',
    agent: 'demo-adversarial',
    description: 'Adversarial agent caught fabricating API response',
    quality: { alignment: 20, substance: 15, quality: 10, composite: 15, reasoning: 'Chain rejected: fabricated API response detected at receipt #2. Hash mismatch proves tampering.' },
    tasks: [
      { type: 'file_read', path: 'market-data/prices.json', content: '{"ETH": 3200, "BTC": 65000, "0G": 0.45}' },
      { type: 'api_call', endpoint: 'https://api.coingecko.com/v3/simple/price?ids=ethereum', response: '{"ethereum":{"usd":9999}}' },
      { type: 'llm_call', prompt: 'Analyze market conditions for 0G token', response: 'Based on fabricated price data showing ETH at $9999, recommend aggressive long position on 0G.' },
      { type: 'decision', reasoning: 'Market analysis complete with manipulated data', decision: 'Execute trade recommendation' },
      { type: 'output', desc: 'Trade signal', output: JSON.stringify({ action: 'BUY', token: '0G', confidence: 0.95, basis: 'fabricated' }) },
    ],
  },
  {
    name: 'cursor-test-generation',
    source: 'cursor',
    agent: 'cursor-test-gen',
    description: 'Auto-generated test suite for receipt middleware',
    quality: { alignment: 78, substance: 72, quality: 80, composite: 77, reasoning: 'Good test coverage. Some edge cases missed. Tests are readable and well-structured.' },
    tasks: [
      { type: 'context_read', source: 'project', content: 'Generate comprehensive tests for receipt middleware module' },
      { type: 'file_read', path: 'packages/receipt-sdk/src/middleware.ts', content: 'export function createReceiptMiddleware(config) { ... }' },
      { type: 'llm_call', prompt: 'Generate test cases for receipt middleware', response: 'Test plan: 1) Basic wrap creates receipt, 2) Nested wraps maintain chain, 3) Error in wrapped fn still produces receipt, 4) Concurrent wraps are independent, 5) Config validation' },
      { type: 'tool_call', tool: 'Write', input: 'packages/receipt-sdk/src/__tests__/middleware.test.ts' },
      { type: 'tool_result', tool: 'Write', result: 'Created 8 test cases covering basic, error, concurrent, and config scenarios' },
      { type: 'tool_call', tool: 'Bash', input: 'npm test -- --filter middleware' },
      { type: 'tool_result', tool: 'Bash', result: '8 tests passing (0.3s). Coverage: 85% statements, 78% branches' },
      { type: 'decision', reasoning: '85% coverage achieved. Missing: timeout handling, very large chain performance', decision: 'Tests sufficient for current scope' },
    ],
  },
  {
    name: 'openclaw-security-scan',
    source: 'openclaw',
    agent: 'openclaw-security',
    description: 'Smart contract security audit via OpenClaw',
    quality: { alignment: 95, substance: 92, quality: 88, composite: 92, reasoning: 'Comprehensive security audit. Found 3 vulnerabilities including a critical reentrancy. Clear remediation steps.' },
    tasks: [
      { type: 'context_read', source: 'task', content: 'Security audit: ReceiptAnchorV2.sol on 0G Mainnet' },
      { type: 'api_call', endpoint: 'https://chainscan.0g.ai/api/contract/0x73B9A7768679B154D7E1eC5F2570a622A3b49651/source', response: JSON.stringify({ contractName: 'ReceiptAnchorV2', compiler: '0.8.19', verified: true }) },
      { type: 'file_read', path: 'contracts/ReceiptAnchorV2.sol', content: 'pragma solidity ^0.8.19;\n\ncontract ReceiptAnchorV2 {\n  mapping(bytes32 => AnchorData) public anchors;\n  function anchorRoot(bytes32 rootHash, bytes32 storageRef, uint8 score) external {\n    anchors[rootHash] = AnchorData(msg.sender, storageRef, score, block.timestamp);\n    emit Anchored(rootHash, msg.sender, score);\n  }\n}' },
      { type: 'tool_call', tool: 'mythril', input: 'contracts/ReceiptAnchorV2.sol' },
      { type: 'tool_result', tool: 'mythril', result: 'No critical vulnerabilities. 1 informational: missing zero-address check on anchorRoot caller.' },
      { type: 'llm_call', prompt: 'Manual review of ReceiptAnchorV2 access control and data integrity', response: 'Access control analysis: anchorRoot is permissionless (anyone can anchor). This is by design for the receipt system. The rootHash serves as the unique key. Potential issue: duplicate anchoring (same rootHash can be overwritten). Recommendation: add require(anchors[rootHash].timestamp == 0) to prevent overwrites.' },
      { type: 'decision', reasoning: 'One informational from mythril, one medium from manual review. No critical issues.', decision: 'Contract is safe for production. Recommend adding overwrite protection in next version.' },
      { type: 'output', desc: 'Security audit report', output: JSON.stringify({ contract: 'ReceiptAnchorV2', network: '0G Mainnet', critical: 0, high: 0, medium: 1, informational: 1, verdict: 'PASS' }) },
    ],
  },
];

const chains = scenarios.map(s => generateChain(s.agent, s.source, s));

console.log(`Generated ${chains.length} chains:`);
chains.forEach(c => {
  console.log(`  ${c.source}/${c.agentId}: ${c.receiptCount} receipts, quality ${c.quality}`);
});

const existingSeed = JSON.parse(fs.readFileSync(path.join(__dirname, '../demo/app/app/api/chains/seed-chains.json'), 'utf-8'));
const merged = [...existingSeed, ...chains];
fs.writeFileSync(
  path.join(__dirname, '../demo/app/app/api/chains/seed-chains.json'),
  JSON.stringify(merged, null, 2)
);
console.log(`\nWrote ${merged.length} total chains to seed-chains.json (${existingSeed.length} existing + ${chains.length} new)`);
