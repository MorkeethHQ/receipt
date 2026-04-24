# RECEIPT

**Proof layer for agent work.** Signed, hash-linked receipts for verifiable AI agent handoffs.

Every action an AI agent takes — reading a file, calling an API, running inference, making a decision — produces a cryptographically signed receipt. Receipts chain together via hash links. When Agent B receives work from Agent A, it independently verifies the entire chain before continuing. If any receipt has been tampered with, the chain breaks and Agent B refuses the handoff.

Receipt chains anchor on-chain for permanent, public verifiability.

## Architecture

```
Agent A                    Agent B
  │                          │
  ├─ file_read → receipt₁    │
  ├─ api_call  → receipt₂    │
  ├─ llm_call  → receipt₃    │
  ├─ decision  → receipt₄    │
  ├─ output    → receipt₅    │
  │                          │
  └──── handoff bundle ──────┤
                             ├─ verify chain (ed25519 + hash links)
                             ├─ file_read → receipt₆
                             ├─ llm_call  → receipt₇
                             ├─ decision  → receipt₈
                             └─ output    → receipt₉
                                    │
                            compute root hash
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
              0G Storage      0G Mainnet      Base Sepolia
             (Merkle root)   (anchor tx)     (anchor tx)
```

## Integrations

### 0G (Track 1: Framework/Tooling + Track 2: Autonomous Agents)

- **0G Compute** — TEE-attested inference via Intel TDX hardware enclaves. LLM calls in the receipt chain carry attestation metadata proving the inference ran in a trusted execution environment.
- **0G Storage** — Content-addressed persistence. Receipt chains serialize to bytes, get Merkle-treed, and the root hash becomes the `storageRef` passed to the anchor contract.
- **0G Chain** — `ReceiptAnchor.sol` deployed on 0G Mainnet (chain ID 16661). `anchorRoot(bytes32, bytes32)` stores the chain root hash + storage reference permanently.

### Gensyn AXL (P2P Agent Communication)

Agent-to-agent handoffs over Gensyn's AXL peer-to-peer network. No centralized server — agents discover each other via AXL topology, send receipt bundles directly, and the receiving agent verifies before extending.

- `sender.ts` — Creates receipt chain, sends handoff bundle to peer via AXL
- `receiver.ts` — Receives bundle, verifies chain, extends with new receipts

### KeeperHub (Automated Anchoring)

KeeperHub workflows trigger automated anchoring:

1. Webhook trigger fires every 10 minutes
2. Handler scans for unanchored chains
3. Verifies → stores to 0G → anchors on both chains

See [FEEDBACK.md](./FEEDBACK.md) for detailed integration feedback.

## Project Structure

```
packages/
  receipt-sdk/          Core SDK — types, crypto, chain, agent, verify, integrations
  receipt-cli/          CLI tool — run, verify, inspect commands

contracts/
  ReceiptAnchor.sol     On-chain anchor contract

demo/
  app/                  Next.js demo — live receipt generation + verification
  agents/               Standalone agent scripts (researcher → builder handoff)
  axl/                  Gensyn AXL P2P demo (sender + receiver)
  keeperhub/            KeeperHub webhook + workflow setup
```

## Quick Start

```bash
# Build SDK
cd packages/receipt-sdk && npm install && npm run build

# Run tests
npm test

# Run demo app
cd demo/app && npm install && npm run dev

# CLI
cd packages/receipt-cli && npm install && npm run build
npx receipt-agent run --task "Analyze codebase" --output chain.json
npx receipt-agent verify chain.json
npx receipt-agent inspect chain.json
```

## Standalone Agents

```bash
# Researcher creates chain, writes handoff to /tmp
npx tsx demo/agents/researcher.ts

# Builder reads handoff, verifies, extends chain
npx tsx demo/agents/builder.ts

# Adversarial mode — tampers receipt, builder refuses
npx tsx demo/agents/researcher.ts --adversarial
npx tsx demo/agents/builder.ts
```

## Contract Deployment

Contract addresses (deployed fresh during hackathon):
- **0G Mainnet:** `0x8228af81d872d027632C8f55a53EbE7bf5872667`
- **Base Sepolia:** `0x3118063e34ED57DB38872C2f213257E7fe90010C`

Wallet: `0x4fD66BdA6d792bE89d1fAeaF9F287AcaCaDBDce6`

## Environment Variables

```
PRIVATE_KEY=wallet_private_key
OG_CONTRACT_ADDRESS=0g_mainnet_contract
BASE_CONTRACT_ADDRESS=base_sepolia_contract
OG_COMPUTE_PROVIDER=0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0
KEEPERHUB_API_KEY=your_api_key
```

## Built With

### AI Tools
- **Claude Code** (Anthropic) — Implementation, code generation, debugging, and iteration

### Human Contributions (Oscar)
- Architecture design — the receipt chain mechanic, hash-linking strategy, and multi-agent handoff protocol
- Product decisions — what to build, what to skip, scope management
- Integration strategy — choosing 0G triple integration (Compute + Storage + Chain), Gensyn AXL for P2P, KeeperHub for scheduling
- Bounty targeting — identifying the 3-sponsor, $25K ceiling strategy across 0G, KeeperHub, and Gensyn
- Demo direction — adversarial mode concept, the "fabrication detected" visual, chain explorer design
- Deployment and operations — contract deployment, Vercel configuration, environment setup

### Stack
- TypeScript, Next.js 15, ed25519 (@noble/ed25519), SHA-256 (@noble/hashes)
- Solidity (ReceiptAnchor.sol)
- 0G SDK (@0gfoundation/0g-ts-sdk, @0glabs/0g-serving-broker)
- Gensyn AXL (Go binary, HTTP API)
- KeeperHub (REST API)

## License

MIT
