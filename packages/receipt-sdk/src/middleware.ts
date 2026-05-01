import { ReceiptAgent } from './agent';
import { ReceiptChain } from './chain';
import type { Receipt, AgentKeyPair, ActionType } from './types';

export interface MiddlewareConfig {
  agentName?: string;
  keys?: AgentKeyPair;
  onChainComplete?: (chain: ReceiptChain) => void;
}

export interface ReceiptMiddleware {
  wrap<T>(actionType: ActionType, description: string, fn: () => T | Promise<T>): Promise<T>;
  getChain(): ReceiptChain;
  getReceipts(): Receipt[];
  verify(): boolean;
  finalize(): ReceiptChain;
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const actionMethodMap: Record<ActionType, (agent: ReceiptAgent, input: string, output: string) => Receipt> = {
  file_read: (agent, input, output) => agent.readFile(input, output),
  api_call: (agent, input, output) => agent.callApi(input, output),
  llm_call: (agent, input, output) => agent.callLlm(input, output),
  decision: (agent, input, output) => agent.decide(input, output),
  output: (agent, input, output) => agent.produceOutput(input, output),
  tool_call: (agent, input, output) => agent.toolCall(input, output),
  tool_result: (agent, input, output) => agent.toolResult(input, output),
  context_read: (agent, input, output) => agent.contextRead(input, output),
  message_send: (agent, input, output) => agent.messageSend(input, output),
  usefulness_review: (agent, input, output) => agent.reviewUsefulness(input, output),
};

export function createReceiptMiddleware(config: MiddlewareConfig = {}): ReceiptMiddleware {
  const agent = ReceiptAgent.create(config.agentName ?? 'middleware-agent', config.keys);

  return {
    async wrap<T>(actionType: ActionType, description: string, fn: () => T | Promise<T>): Promise<T> {
      const result = await fn();
      const input = stringify(description);
      const output = stringify(result);
      const method = actionMethodMap[actionType];
      method(agent, input, output);
      return result;
    },

    getChain(): ReceiptChain {
      return agent.getChain();
    },

    getReceipts(): Receipt[] {
      return agent.getReceipts();
    },

    verify(): boolean {
      return agent.verifyOwnChain();
    },

    finalize(): ReceiptChain {
      const chain = agent.getChain();
      config.onChainComplete?.(chain);
      return chain;
    },
  };
}
