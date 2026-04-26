/**
 * OpenClaw RECEIPT Plugin
 *
 * Hooks into the agent lifecycle to create a cryptographic receipt chain
 * for every agent run. Each tool call, context read, decision, and message
 * becomes a signed, hash-linked receipt.
 *
 * Install: openclaw plugins install ./openclaw-plugin-receipt
 * Config:  plugins.entries.receipt in openclaw.json
 *
 * HTTP endpoints (on gateway port):
 *   GET /plugins/receipt/chains       — list completed chains
 *   GET /plugins/receipt/chains/:id   — get a specific chain
 *   GET /plugins/receipt/latest       — most recent completed chain
 *   GET /plugins/receipt/active       — currently building chain (if any)
 */

import {
  createAgentRun,
  type WrapConfig,
  type Receipt,
  hash,
  publicKeyToHex,
  verifyChain,
} from 'receipt-sdk';

// ── Types ──────────────────────────────────────────────────────────────

interface PluginConfig {
  enabled: boolean;
  maxRawSize: number;
  httpRoute: string;
  axlForward: boolean;
  axlPeerId: string;
}

interface CompletedChain {
  id: string;
  runId: string;
  agentId: string;
  sessionId: string;
  receipts: Receipt[];
  rootHash: string;
  valid: boolean;
  publicKey: string;
  completedAt: number;
  durationMs: number;
  stats: {
    total: number;
    byType: Record<string, number>;
    toolCalls: string[];
  };
}

// ── State ──────────────────────────────────────────────────────────────

const completedChains: CompletedChain[] = [];
const MAX_STORED_CHAINS = 100;

let activeRun: ReturnType<typeof createAgentRun> | null = null;
let activeRunStartedAt = 0;
let activeSessionId = '';
let activeAgentId = '';
let activeToolCalls: string[] = [];

// ── Helpers ────────────────────────────────────────────────────────────

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + `…[${str.length - max} more]`;
}

function safeStringify(data: unknown, maxLen = 2048): string {
  try {
    const s = typeof data === 'string' ? data : JSON.stringify(data);
    return truncate(s, maxLen);
  } catch {
    return '[unserializable]';
  }
}

// ── Plugin Entry ───────────────────────────────────────────────────────

export function register(api: any) {
  const cfg: PluginConfig = {
    enabled: api.config?.enabled ?? true,
    maxRawSize: api.config?.maxRawSize ?? 2048,
    httpRoute: api.config?.httpRoute ?? '/plugins/receipt',
    axlForward: api.config?.axlForward ?? false,
    axlPeerId: api.config?.axlPeerId ?? '',
  };

  if (!cfg.enabled) return;

  // ── Hook: before_prompt_build ──────────────────────────────────────
  // Fires before the system prompt is assembled. We start a new receipt
  // chain and record what context the agent is loading.

  api.registerHook('before_prompt_build', (event: any) => {
    const agentId = event.agentId ?? event.agent?.id ?? 'openclaw';
    const sessionId = event.sessionId ?? event.session?.id ?? `session-${Date.now()}`;

    activeRun = createAgentRun({
      agentId,
      sessionId,
      maxRawSize: cfg.maxRawSize,
    });
    activeRunStartedAt = Date.now();
    activeSessionId = sessionId;
    activeAgentId = agentId;
    activeToolCalls = [];

    // Record context sources being loaded into the prompt
    const sources = event.sources ?? event.contextSources ?? [];
    if (Array.isArray(sources)) {
      for (const src of sources) {
        const name = typeof src === 'string' ? src : src.name ?? src.path ?? 'unknown';
        const content = typeof src === 'string' ? src : src.content ?? src.snippet ?? '';
        activeRun.contextRead(name, safeStringify(content, cfg.maxRawSize));
      }
    }

    // Record the user message that triggered this run
    const userMessage = event.message ?? event.userMessage ?? event.input;
    if (userMessage) {
      activeRun.contextRead('user_message', safeStringify(userMessage, cfg.maxRawSize));
    }
  });

  // ── Hook: before_tool_call ─────────────────────────────────────────
  // Fires before every tool invocation. Creates a tool_call receipt.

  api.registerHook('before_tool_call', (event: any) => {
    if (!activeRun) return;

    const toolName = event.name ?? event.tool ?? event.toolName ?? 'unknown_tool';
    const input = event.params ?? event.args ?? event.input ?? {};

    activeRun.toolCall(toolName, safeStringify(input, cfg.maxRawSize));
    activeToolCalls.push(toolName);
  });

  // ── Hook: after_tool_call ──────────────────────────────────────────
  // Fires after every tool invocation. Creates a tool_result receipt.

  api.registerHook('after_tool_call', (event: any) => {
    if (!activeRun) return;

    const toolName = event.name ?? event.tool ?? event.toolName ?? 'unknown_tool';
    const result = event.result ?? event.output ?? event.content ?? {};
    const error = event.error;

    if (error) {
      activeRun.toolResult(toolName, safeStringify({ error: String(error) }, cfg.maxRawSize));
    } else {
      activeRun.toolResult(toolName, safeStringify(result, cfg.maxRawSize));
    }
  });

  // ── Hook: message_sending ──────────────────────────────────────────
  // Fires before the agent sends a message to the user/channel.

  api.registerHook('message_sending', (event: any) => {
    if (!activeRun) return;

    const recipient = event.channel ?? event.recipient ?? event.to ?? 'user';
    const content = event.content ?? event.text ?? event.message ?? '';

    activeRun.messageSend(
      typeof recipient === 'string' ? recipient : String(recipient),
      safeStringify(content, cfg.maxRawSize),
    );
  });

  // ── Hook: agent_end ────────────────────────────────────────────────
  // Fires when the agent finishes a run. Finalizes the chain.

  api.registerHook('agent_end', (event: any) => {
    if (!activeRun) return;

    // Record the final decision/answer
    const finalMessage = event.finalMessage ?? event.reply ?? event.output ?? '';
    const reasoning = event.reasoning ?? event.thinking ?? '';

    if (finalMessage || reasoning) {
      activeRun.decision(
        safeStringify(reasoning || 'Agent completed run', cfg.maxRawSize),
        safeStringify(finalMessage || 'Run finalized', cfg.maxRawSize),
      );
    }

    // Finalize chain
    const chain = activeRun.finalize();
    const durationMs = Date.now() - activeRunStartedAt;

    const byType: Record<string, number> = {};
    for (const r of chain.receipts) {
      byType[r.action.type] = (byType[r.action.type] ?? 0) + 1;
    }

    const completed: CompletedChain = {
      id: chain.runId,
      runId: chain.runId,
      agentId: activeAgentId,
      sessionId: activeSessionId,
      receipts: chain.receipts,
      rootHash: chain.rootHash,
      valid: chain.valid,
      publicKey: chain.publicKey,
      completedAt: Date.now(),
      durationMs,
      stats: {
        total: chain.receipts.length,
        byType,
        toolCalls: [...activeToolCalls],
      },
    };

    completedChains.unshift(completed);
    if (completedChains.length > MAX_STORED_CHAINS) {
      completedChains.length = MAX_STORED_CHAINS;
    }

    // Forward via AXL if configured
    if (cfg.axlForward && cfg.axlPeerId) {
      forwardViaAxl(completed, cfg).catch((err: Error) => {
        console.error(`[receipt] AXL forward failed: ${err.message}`);
      });
    }

    // Reset
    activeRun = null;
    activeRunStartedAt = 0;
    activeSessionId = '';
    activeAgentId = '';
    activeToolCalls = [];
  });

  // ── HTTP Routes ────────────────────────────────────────────────────

  api.registerHttpRoute({
    method: 'GET',
    path: `${cfg.httpRoute}/chains`,
    handler: (_req: any, res: any) => {
      const summaries = completedChains.map((c) => ({
        id: c.id,
        agentId: c.agentId,
        receipts: c.stats.total,
        valid: c.valid,
        rootHash: c.rootHash,
        completedAt: c.completedAt,
        durationMs: c.durationMs,
        toolCalls: c.stats.toolCalls,
      }));
      res.json(summaries);
    },
  });

  api.registerHttpRoute({
    method: 'GET',
    path: `${cfg.httpRoute}/chains/:id`,
    handler: (req: any, res: any) => {
      const chain = completedChains.find((c) => c.id === req.params.id);
      if (!chain) {
        res.status(404).json({ error: 'Chain not found' });
        return;
      }
      res.json(chain);
    },
  });

  api.registerHttpRoute({
    method: 'GET',
    path: `${cfg.httpRoute}/latest`,
    handler: (_req: any, res: any) => {
      if (completedChains.length === 0) {
        res.status(404).json({ error: 'No completed chains yet' });
        return;
      }
      res.json(completedChains[0]);
    },
  });

  api.registerHttpRoute({
    method: 'GET',
    path: `${cfg.httpRoute}/active`,
    handler: (_req: any, res: any) => {
      if (!activeRun) {
        res.json({ active: false });
        return;
      }
      res.json({
        active: true,
        agentId: activeAgentId,
        sessionId: activeSessionId,
        startedAt: activeRunStartedAt,
        elapsedMs: Date.now() - activeRunStartedAt,
        toolCalls: activeToolCalls,
      });
    },
  });

  // Verification endpoint — proves chain integrity
  api.registerHttpRoute({
    method: 'GET',
    path: `${cfg.httpRoute}/verify/:id`,
    handler: (req: any, res: any) => {
      const chain = completedChains.find((c) => c.id === req.params.id);
      if (!chain) {
        res.status(404).json({ error: 'Chain not found' });
        return;
      }
      const pubKeyBytes = new Uint8Array(
        (chain.publicKey.match(/.{1,2}/g) ?? []).map((b: string) => parseInt(b, 16)),
      );
      const results = verifyChain(chain.receipts, pubKeyBytes);
      const allValid = results.every((r) => r.valid);
      res.json({
        chainId: chain.id,
        valid: allValid,
        receipts: results.map((r) => ({
          id: r.receiptId,
          valid: r.valid,
          error: r.error,
        })),
      });
    },
  });
}

// ── AXL Forwarding ───────────────────────────────────────────────────

async function forwardViaAxl(chain: CompletedChain, cfg: PluginConfig): Promise<void> {
  const { createAxlClient } = await import('receipt-sdk');
  const axl = createAxlClient();

  const bundle = {
    chainRootHash: chain.rootHash,
    receipts: chain.receipts,
    agentId: chain.agentId,
    timestamp: chain.completedAt,
    storageRef: null,
  };

  await axl.sendHandoff(cfg.axlPeerId, bundle);
}
