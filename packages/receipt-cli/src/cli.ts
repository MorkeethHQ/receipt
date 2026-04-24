#!/usr/bin/env node

import { Command } from 'commander';
import { run } from './commands/run.js';
import { verify } from './commands/verify.js';
import { inspect } from './commands/inspect.js';
import { exportCmd } from './commands/export.js';
import { anchor } from './commands/anchor.js';

const program = new Command();

program
  .name('receipt-cli')
  .description('CLI for R.E.C.E.I.P.T. — cryptographic proof layer for AI agent work')
  .version('0.1.0');

program
  .command('run')
  .description('Run a demo agent flow (create receipts, verify chain, print results)')
  .option('-t, --task <task>', 'Task description', 'Analyze project')
  .option('-o, --output <file>', 'Output chain to JSON file')
  .option('--adversarial', 'Enable adversarial mode (tamper with receipt)')
  .action(run);

program
  .command('inspect')
  .description('Inspect receipt chain details from a JSON file')
  .argument('<file>', 'Path to receipt chain JSON')
  .option('--receipt <id>', 'Show specific receipt by ID')
  .action(inspect);

program
  .command('verify')
  .description('Verify a receipt chain from a JSON file')
  .argument('<file>', 'Path to receipt chain JSON')
  .action(verify);

program
  .command('export')
  .description('Convert receipt chain to training data JSONL format')
  .argument('<file>', 'Path to receipt chain JSON')
  .option('-f, --format <format>', 'Output format', 'jsonl')
  .option('-o, --output <file>', 'Output file (stdout if omitted)')
  .action(exportCmd);

program
  .command('anchor')
  .description('Anchor a receipt chain on-chain (simulated if no PRIVATE_KEY env var)')
  .argument('<file>', 'Path to receipt chain JSON')
  .option('--rpc <url>', 'RPC endpoint', 'https://evmrpc-testnet.0g.ai')
  .option('--contract <address>', 'Contract address')
  .action(anchor);

program.parse();
