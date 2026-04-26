/**
 * Wrap any AI agent with RECEIPT — cryptographic proof of every action.
 *
 * This example shows how to add receipt tracking to an existing agent.
 * Replace the simulated calls with your actual agent logic.
 *
 * Run: npx tsx examples/wrap-agent.ts
 */

import { ReceiptAgent } from 'receipt-sdk';

const agent = ReceiptAgent.create('my-agent');

// 1. Agent reads a file
const config = '{"model": "gpt-4", "temperature": 0.3}';
agent.readFile('config.json', config);

// 2. Agent calls an API
const apiResponse = '{"status": "ok", "data": [1, 2, 3]}';
agent.callApi('https://api.example.com/data', apiResponse);

// 3. Agent makes an LLM call
const prompt = 'Analyze the API response and summarize findings';
const llmOutput = 'The API returned 3 data points. All values are sequential integers starting from 1.';
agent.callLlm(prompt, llmOutput);

// 4. Agent makes a decision
agent.decide(
  'API data is valid, LLM analysis confirms sequential pattern',
  'Proceed with report generation',
);

// 5. Agent produces output
agent.produceOutput(
  'Analysis report',
  JSON.stringify({ finding: 'Sequential integers', confidence: 0.95 }),
);

// Verify the chain
console.log('Chain valid:', agent.verifyOwnChain());
console.log('Receipts:', agent.getReceipts().length);
console.log('Root hash:', agent.getChain().computeRootHash());

// Export for handoff or anchoring
const chain = agent.getReceipts();
console.log('\nReceipt chain:');
for (const r of chain) {
  console.log(`  [${r.action.type}] ${r.action.description} — ${r.id.slice(0, 12)}...`);
}
