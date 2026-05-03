# AGENT.md: Setting Up RECEIPT for Your Agents

After installing the SDK (`npm install agenticproof`), here's how to set up receipting for each agent tool.

## Claude Code

One command. Every file read, edit, bash command, and agent spawn becomes a signed receipt.

```bash
npx receipt init --claude-code
```

This adds hooks to `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [{ "command": "node .receipt/hooks/post-tool-use.mjs" }],
    "SessionStart": [{ "command": "node .receipt/hooks/session-start.mjs" }],
    "Stop": [{ "command": "node .receipt/hooks/stop.mjs" }]
  }
}
```

Chains are written to `.receipt/chains/` when a session ends. They auto-publish to the dashboard if `RECEIPT_DASHBOARD_URL` is set.

```bash
# Optional: auto-publish chains to your dashboard
export RECEIPT_DASHBOARD_URL=https://receipt-murex.vercel.app
```

## Cursor

A file watcher monitors every edit Cursor's agent makes:

```bash
npx receipt init --cursor
node .receipt/cursor-watcher.mjs
```

Press `Ctrl+C` to finalize the chain when you're done. The watcher captures every file change as a signed receipt.

## OpenClaw

Native plugin with zero code changes. Hooks into the agent lifecycle automatically:

```bash
openclaw plugins install openclaw-plugin-receipt
```

| Agent Action | Receipt Type |
|-------------|-------------|
| Loading context/memory | `context_read` |
| Calling a tool | `tool_call` |
| Tool returns result | `tool_result` |
| Sending a message | `message_send` |
| Final answer | `decision` |

Query chains via the gateway:

```bash
curl http://localhost:18789/plugins/receipt/latest
curl http://localhost:18789/plugins/receipt/chains
curl http://localhost:18789/plugins/receipt/verify/CHAIN_ID
```

## Custom Agents (SDK)

### Option 1: ReceiptAgent (simplest)

```typescript
import { ReceiptAgent, verifyChain } from 'agenticproof';

const agent = ReceiptAgent.create('my-agent');

agent.readFile('config.json', fileContents);
agent.callApi('https://api.example.com', apiResponse);
agent.callLlm('analyze this', llmOutput);
agent.decide('reasoning here', 'proceed with plan');
agent.produceOutput('report', reportJson);

const chain = agent.getChain();
console.log(chain.getReceipts().length); // 5
console.log(agent.verifyOwnChain());    // true
```

### Option 2: Wrap existing tools

```typescript
import { createAgentRun, wrapTool } from 'agenticproof';

const run = createAgentRun({ agentId: 'my-agent' });

// Wrap any async function to auto-generate receipts
const search = wrapTool(run, 'search_code', mySearchFunction);
const results = await search({ query: 'withdraw', repo: 'vault' });

const chain = run.finalize();
```

### Option 3: Middleware (wrap any function)

```typescript
import { createReceiptMiddleware } from 'agenticproof';

const middleware = createReceiptMiddleware({ agentName: 'my-agent' });

const result = await middleware.wrap('llm_call', 'Analyze data', async () => {
  return await llm.chat('Analyze this dataset');
});

const chain = middleware.getChain();
```

## Multi-Agent Handoff

The Researcher produces a chain. The Builder verifies it before continuing.

```typescript
import { ReceiptAgent, verifyChain } from 'agenticproof';

// Agent A: Researcher
const researcher = ReceiptAgent.create('researcher');
researcher.readFile('data.csv', csvContent);
researcher.callLlm('analyze trends', analysis);
researcher.produceOutput('research report', report);

// Handoff: Agent B receives and verifies
const results = verifyChain(researcher.getReceipts(), researcher.getPublicKey());
const allValid = results.every(r => r.valid);

if (!allValid) {
  console.log('Chain rejected: tampering detected');
  process.exit(1);
}

// Agent B: Builder continues from verified chain
const builder = ReceiptAgent.continueFrom(researcher.getReceipts());
builder.readFile('requirements.md', requirements);
builder.decide('Research is valid, proceeding', 'Build feature');
builder.produceOutput('implementation', code);
```

## Verify a Chain

```bash
# CLI
npx receipt verify chain.json

# Programmatic
import { verifyChain } from 'agenticproof';
const results = verifyChain(receipts, publicKey);
results.forEach(r => console.log(r.receiptId, r.valid));
```

Or use the web verifier: [receipt-murex.vercel.app/verify](https://receipt-murex.vercel.app/verify)

## Anchor On-Chain (0G Mainnet)

After verification, anchor the chain's root hash on 0G Mainnet:

```typescript
import { anchorOnChain } from 'agenticproof';

const result = await anchorOnChain({
  rootHash: chain.computeRootHash(),
  storageRef: '0x...',
  qualityScore: 85,
  privateKey: process.env.PRIVATE_KEY,
  contractAddress: '0x73B9A7768679B154D7E1eC5F2570a622A3b49651',
  rpcUrl: 'https://evmrpc-mainnet.0g.ai',
});

console.log('Anchored:', result.txHash);
```

## Environment Variables

```bash
# Required for on-chain anchoring
PRIVATE_KEY=your_wallet_private_key

# Contract addresses (0G Mainnet, chain 16661)
OG_CONTRACT_ADDRESS=0x73B9A7768679B154D7E1eC5F2570a622A3b49651
AGENT_NFT_ADDRESS=0xf964d45c3Ea5368918B1FDD49551E373028108c9
VALIDATION_REGISTRY_ADDRESS=0x2E32E845928A92DB193B59676C16D52923Fa01dd

# Optional
RECEIPT_DASHBOARD_URL=https://receipt-murex.vercel.app
AXL_BASE_URL=http://127.0.0.1:9002
```

## Dashboard

View all your agent chains at [receipt-murex.vercel.app/team](https://receipt-murex.vercel.app/team).

Connect your wallet to register chains on-chain via the ReceiptRegistry contract. No database, no server. Just proof.
