// ANSI color helpers — zero dependencies

const ESC = '\x1b[';
const RESET = `${ESC}0m`;

export const c = {
  reset:   (s: string) => `${RESET}${s}`,
  bold:    (s: string) => `${ESC}1m${s}${RESET}`,
  dim:     (s: string) => `${ESC}2m${s}${RESET}`,
  green:   (s: string) => `${ESC}32m${s}${RESET}`,
  red:     (s: string) => `${ESC}31m${s}${RESET}`,
  yellow:  (s: string) => `${ESC}33m${s}${RESET}`,
  blue:    (s: string) => `${ESC}34m${s}${RESET}`,
  magenta: (s: string) => `${ESC}35m${s}${RESET}`,
  cyan:    (s: string) => `${ESC}36m${s}${RESET}`,
  gray:    (s: string) => `${ESC}90m${s}${RESET}`,
};

export const ok  = c.green('✓');
export const fail = c.red('✗');
export const warn = c.yellow('⚠');

/** Truncate a hash/id to first N hex chars + ellipsis */
export function trunc(s: string, n = 12): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + '...';
}

/** Print a labeled field with consistent alignment */
export function field(label: string, value: string, indent = 2): string {
  const pad = ' '.repeat(indent);
  return `${pad}${c.gray(label.padEnd(12))}${value}`;
}

/** Banner line */
export function banner(text: string): string {
  return c.cyan(`\n  ╔${'═'.repeat(text.length + 2)}╗\n  ║ ${text} ║\n  ╚${'═'.repeat(text.length + 2)}╝\n`);
}

/** Section header */
export function section(text: string): string {
  return `\n${c.bold(c.cyan(`  ── ${text} ──`))}\n`;
}

/** Color for action types */
export function actionColor(type: string): (s: string) => string {
  switch (type) {
    case 'file_read': return c.yellow;
    case 'api_call':  return c.magenta;
    case 'llm_call':  return c.cyan;
    case 'decision':  return c.green;
    case 'output':    return c.blue;
    default:          return c.gray;
  }
}

/** Write to stderr (all UI output goes here; stdout reserved for data) */
export function out(line: string): void {
  process.stderr.write(line + '\n');
}
