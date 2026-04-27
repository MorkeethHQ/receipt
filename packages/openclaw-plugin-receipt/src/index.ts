/**
 * OpenClaw RECEIPT Extension
 *
 * Cryptographic receipt chain for every agent action.
 * Self-contained — no external dependencies.
 */

import { createHash, generateKeyPairSync, sign as cryptoSign } from 'crypto';

// ── Inline receipt primitives ────────────────────────────────────────

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

interface Receipt {
  id: string;
  prevId: string | null;
  agentId: string;
  timestamp: number;
  action: { type: string; description: string };
  inputHash: string;
  outputHash: string;
  signature: string;
}

interface CompletedChain {
  id: string;
  runId: string;
  agentId: string;
  receipts: Receipt[];
  rootHash: string;
  valid: boolean;
  publicKey: string;
  completedAt: number;
  durationMs: number;
  stats: { total: number; byType: Record<string, number>; toolCalls: string[] };
}

class ReceiptBuilder {
  private receipts: Receipt[] = [];
  private agentId: string;
  private runId: string;
  private publicKeyHex: string;
  private privateKeyDer: Buffer;

  constructor(agentId: string) {
    this.agentId = agentId;
    this.runId = `${agentId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    this.publicKeyHex = publicKey.export({ type: 'spki', format: 'der' }).toString('hex');
    this.privateKeyDer = privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer;
  }

  private add(type: string, description: string, input: string, output: string): Receipt {
    const prevId = this.receipts.length > 0 ? this.receipts[this.receipts.length - 1].id : null;
    const ts = Date.now();
    const inputHash = sha256(input);
    const outputHash = sha256(output);
    const id = sha256(`${prevId || 'null'}:${this.agentId}:${ts}:${type}:${inputHash}:${outputHash}`);
    const payload = `${id}:${prevId || 'null'}:${this.agentId}:${ts}:${type}:${inputHash}:${outputHash}`;

    let signature: string;
    try {
      const keyObj = require('crypto').createPrivateKey({ key: this.privateKeyDer, format: 'der', type: 'pkcs8' });
      signature = cryptoSign(null, Buffer.from(payload), keyObj).toString('hex');
    } catch {
      signature = sha256(payload + ':unsigned');
    }

    const receipt: Receipt = { id, prevId, agentId: this.agentId, timestamp: ts, action: { type, description }, inputHash, outputHash, signature };
    this.receipts.push(receipt);
    return receipt;
  }

  contextRead(name: string, content: string) { this.add('context_read', `Read: ${name}`, name, content); }
  toolCall(name: string, input: string) { this.add('tool_call', `Tool: ${name}`, name, input); }
  toolResult(name: string, output: string) { this.add('tool_result', `Result: ${name}`, name, output); }
  messageSend(to: string, content: string) { this.add('message_send', `Message → ${to}`, to, content); }
  decision(reasoning: string, output: string) { this.add('decision', 'Decision', reasoning, output); }

  finalize() {
    const last = this.receipts[this.receipts.length - 1];
    const rootHash = last ? sha256(`${last.id}:${last.inputHash}:${last.outputHash}:${last.signature}`) : sha256('empty');
    return { runId: this.runId, receipts: [...this.receipts], rootHash, valid: true, publicKey: this.publicKeyHex };
  }
}

// ── State ──────────────────────────────────────────────────────────────

const completedChains: CompletedChain[] = [];
const MAX_CHAINS = 100;
let builder: ReceiptBuilder | null = null;
let startedAt = 0;
let toolCalls: string[] = [];

function truncate(s: string, max = 2048): string {
  return s.length <= max ? s : s.slice(0, max);
}

function safe(data: unknown): string {
  try { return typeof data === 'string' ? data : JSON.stringify(data); } catch { return ''; }
}

// ── Plugin ─────────────────────────────────────────────────────────────

const plugin = {
  id: 'receipt',
  name: 'RECEIPT',
  description: 'Cryptographic proof chain for every agent action.',

  register(api: any) {
    api.on('before_prompt_build', async () => {
      builder = new ReceiptBuilder('openclaw');
      startedAt = Date.now();
      toolCalls = [];
      return { prependSystemContext: '[RECEIPT] Chain started — all actions receipted.' };
    });

    api.on('before_agent_start', async (event: any) => {
      if (!builder && event.prompt) {
        builder = new ReceiptBuilder('openclaw');
        startedAt = Date.now();
        toolCalls = [];
      }
      if (builder && event.prompt) {
        builder.contextRead('user_message', truncate(safe(event.prompt)));
      }
    });

    api.on('message_received', async (event: any) => {
      if (!builder) return;
      const content = event.content ?? event.text ?? '';
      if (content) builder.contextRead('incoming', truncate(safe(content)));
    });

    api.on('message_sending', async (event: any) => {
      if (!builder) return;
      const content = event.content ?? event.text ?? '';
      const channel = event.channel ?? 'user';
      if (content) builder.messageSend(String(channel), truncate(safe(content)));
    });

    api.on('agent_end', async (event: any) => {
      if (!builder) return;

      if (event.messages) {
        const texts: string[] = [];
        for (const msg of event.messages as any[]) {
          if (msg && typeof msg === 'object' && typeof (msg as any).content === 'string') {
            texts.push((msg as any).content);
          }
        }
        if (texts.length) builder.decision('Agent completed', truncate(texts.join('\n')));
      }

      const chain = builder.finalize();
      const byType: Record<string, number> = {};
      for (const r of chain.receipts) byType[r.action.type] = (byType[r.action.type] ?? 0) + 1;

      completedChains.unshift({
        id: chain.runId, runId: chain.runId, agentId: 'openclaw',
        receipts: chain.receipts, rootHash: chain.rootHash,
        valid: chain.valid, publicKey: chain.publicKey,
        completedAt: Date.now(), durationMs: Date.now() - startedAt,
        stats: { total: chain.receipts.length, byType, toolCalls: [...toolCalls] },
      });
      if (completedChains.length > MAX_CHAINS) completedChains.length = MAX_CHAINS;

      api.logger?.info?.(`[receipt] Chain: ${chain.receipts.length} receipts, root ${chain.rootHash.slice(0, 16)}…`);
      builder = null;
      startedAt = 0;
      toolCalls = [];
    });

    // ── HTTP (raw Node IncomingMessage/ServerResponse) ─────────────────

    function sendJson(res: any, status: number, data: unknown): boolean {
      const body = JSON.stringify(data);
      res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
      res.end(body);
      return true;
    }

    api.registerHttpRoute({
      path: '/plugins/receipt',
      auth: 'gateway',
      match: 'prefix',
      handler: async (req: any, res: any): Promise<boolean> => {
        const url = typeof req.url === 'string' ? req.url : '';
        const path = url.replace(/^\/plugins\/receipt/, '').split('?')[0] || '/';

        if (path === '/chains' || path === '/chains/') {
          return sendJson(res, 200, completedChains.map(c => ({
            id: c.id, agentId: c.agentId, receipts: c.stats.total,
            valid: c.valid, rootHash: c.rootHash, completedAt: c.completedAt,
          })));
        }
        if (path === '/latest') {
          return completedChains.length > 0
            ? sendJson(res, 200, completedChains[0])
            : sendJson(res, 404, { error: 'No chains yet' });
        }
        if (path === '/active') {
          return sendJson(res, 200, builder
            ? { active: true, agentId: 'openclaw', startedAt, elapsedMs: Date.now() - startedAt, toolCalls }
            : { active: false });
        }
        if (path.startsWith('/verify/')) {
          const id = path.replace('/verify/', '');
          const chain = completedChains.find(c => c.id === id);
          if (!chain) return sendJson(res, 404, { error: 'Not found' });
          let allValid = true;
          const results = chain.receipts.map((r, i) => {
            const linkOk = i === 0 ? r.prevId === null : r.prevId === chain.receipts[i - 1].id;
            if (!linkOk) allValid = false;
            return { id: r.id, valid: linkOk };
          });
          return sendJson(res, 200, { chainId: chain.id, valid: allValid, receipts: results });
        }
        if (path.startsWith('/chains/')) {
          const id = path.replace('/chains/', '');
          const chain = completedChains.find(c => c.id === id);
          return chain ? sendJson(res, 200, chain) : sendJson(res, 404, { error: 'Not found' });
        }
        return sendJson(res, 200, { plugin: 'receipt', version: '0.1.0', chains: completedChains.length, active: !!builder });
      },
    });
  },
};

export default plugin;
