#!/usr/bin/env node

import { Command } from 'commander';
import { run } from './commands/run.js';
import { verify } from './commands/verify.js';
import { inspect } from './commands/inspect.js';

const program = new Command();

program
  .name('receipt-agent')
  .description('CLI for RECEIPT — proof layer for agent work')
  .version('0.1.0');

program
  .command('run')
  .description('Run a receipt-generating agent pipeline')
  .option('-t, --task <task>', 'Task description', 'Analyze project')
  .option('-o, --output <file>', 'Output chain to JSON file')
  .option('--adversarial', 'Enable adversarial mode (tamper with receipt)')
  .action(run);

program
  .command('verify')
  .description('Verify a receipt chain from a JSON file')
  .argument('<file>', 'Path to receipt chain JSON')
  .action(verify);

program
  .command('inspect')
  .description('Inspect receipt chain details')
  .argument('<file>', 'Path to receipt chain JSON')
  .option('--receipt <id>', 'Show specific receipt by ID')
  .action(inspect);

program.parse();
