import { ReceiptAgent } from './agent';
import { hash } from './crypto';
import type { Receipt, AgentKeyPair, Attestation } from './types';

export interface WrapConfig {
  agentId: string;
  keys?: AgentKeyPair;
  maxRawSize?: number;
  sessionId?: string;
}

export interface NormalizedPayload {
  raw?: string;
  hash: string;
  summary: string;
  size: number;
  toolName?: string;
  timestamp: number;
}

function normalize(data: unknown, maxRaw: number): string {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  if (str.length <= maxRaw) return str;
  const h = hash(str);
  const summary = str.slice(0, Math.min(200, maxRaw));
  return JSON.stringify({ hash: h, summary, size: str.length });
}

/**
 * Wrap any tool-using agent with RECEIPT.
 *
 * Creates one receipt chain per agent run. Each meaningful action
 * (context read, tool call, tool result, decision, message) becomes
 * a signed, hash-linked receipt in the chain.
 *
 * Usage:
 *   const run = createAgentRun({ agentId: 'openclaw' });
 *
 *   run.contextRead('memory.json', memoryContents);
 *   run.toolCall('search', { query: 'Solidity reentrancy' });
 *   run.toolResult('search', searchResults);
 *   run.decision('File is safe', 'No vulnerabilities found');
 *   run.messageSend('user', 'Analysis complete. No issues.');
 *
 *   const chain = run.finalize();
 */
export function createAgentRun(config: WrapConfig) {
  const maxRaw = config.maxRawSize ?? 2048;
  const agent = ReceiptAgent.create(config.agentId, config.keys);
  const runId = `${config.agentId}-${Date.now()}`;
  const sessionId = config.sessionId ?? runId;
  let finalized = false;

  function tag(toolName?: string): string {
    const parts = [`run:${runId}`, `session:${sessionId}`, `t:${Date.now()}`];
    if (toolName) parts.push(`tool:${toolName}`);
    return parts.join('|');
  }

  return {
    get runId() { return runId; },
    get sessionId() { return sessionId; },

    contextRead(source: string, content: unknown): Receipt {
      const payload = normalize(content, maxRaw);
      return agent.contextRead(`${source}|${tag()}`, payload);
    },

    toolCall(toolName: string, input: unknown): Receipt {
      const payload = normalize(input, maxRaw);
      return agent.toolCall(`${toolName}|${tag(toolName)}`, payload);
    },

    toolResult(toolName: string, result: unknown): Receipt {
      const payload = normalize(result, maxRaw);
      return agent.toolResult(`${toolName}|${tag(toolName)}`, payload);
    },

    decision(reasoning: string, decision: string): Receipt {
      return agent.decide(
        `${normalize(reasoning, maxRaw)}`,
        `${normalize(decision, maxRaw)}`,
      );
    },

    messageSend(recipient: string, content: string): Receipt {
      return agent.messageSend(`${recipient}|${tag()}`, normalize(content, maxRaw));
    },

    llmCall(prompt: string, response: string, attestation?: Attestation | null): Receipt {
      return agent.callLlm(
        normalize(prompt, maxRaw),
        normalize(response, maxRaw),
        attestation ?? null,
      );
    },

    finalize(): {
      runId: string;
      sessionId: string;
      receipts: Receipt[];
      rootHash: string;
      valid: boolean;
      publicKey: string;
    } {
      finalized = true;
      const receipts = agent.getReceipts();
      const rootHash = agent.getChain().computeRootHash();
      const valid = agent.verifyOwnChain();
      const publicKey = Buffer.from(agent.getPublicKey()).toString('hex');
      return { runId, sessionId, receipts, rootHash, valid, publicKey };
    },

    getAgent(): ReceiptAgent {
      return agent;
    },
  };
}

/**
 * Wrap a tool-calling function so every call/result pair is receipted.
 *
 * Usage:
 *   const run = createAgentRun({ agentId: 'openclaw' });
 *   const search = wrapTool(run, 'search', originalSearchFn);
 *   const result = await search({ query: 'reentrancy' });
 *   // Two receipts created: tool_call + tool_result
 */
export function wrapTool<TInput, TOutput>(
  run: ReturnType<typeof createAgentRun>,
  toolName: string,
  fn: (input: TInput) => Promise<TOutput>,
): (input: TInput) => Promise<TOutput> {
  return async (input: TInput) => {
    run.toolCall(toolName, input);
    const result = await fn(input);
    run.toolResult(toolName, result);
    return result;
  };
}
