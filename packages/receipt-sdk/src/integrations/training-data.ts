import type { Receipt } from '../types';

export interface TrainingExample {
  messages: { role: string; content: string }[];
}

export function receiptsToTrainingData(receipts: Receipt[]): TrainingExample[] {
  const examples: TrainingExample[] = [];

  for (const receipt of receipts) {
    const { action } = receipt;

    switch (action.type) {
      case 'llm_call': {
        const prompt = action.metadata?.prompt as string ?? action.description;
        const response = action.metadata?.response as string ?? `Completed: ${action.description}`;
        examples.push({
          messages: [
            { role: 'system', content: 'You are a verified AI agent. Every action you take produces a cryptographic receipt. Respond accurately and concisely.' },
            { role: 'user', content: prompt },
            { role: 'assistant', content: response },
          ],
        });
        break;
      }
      case 'decision': {
        const reasoning = action.metadata?.reasoning as string ?? action.description;
        const decision = action.metadata?.decision as string ?? 'Proceed with action';
        examples.push({
          messages: [
            { role: 'system', content: 'You are a verified AI agent making decisions. Explain your reasoning clearly, then state your decision.' },
            { role: 'user', content: `Given this context, what should we do? ${reasoning}` },
            { role: 'assistant', content: `Decision: ${decision}\n\nReasoning: ${reasoning}` },
          ],
        });
        break;
      }
      case 'file_read': {
        const fileInput = action.metadata?.input as string ?? action.description;
        const fileContent = action.metadata?.output as string ?? action.metadata?.content as string ?? `Completed: ${action.description}`;
        examples.push({
          messages: [
            { role: 'system', content: 'You are an AI agent that reads files and extracts relevant information. Provide accurate, structured analysis.' },
            { role: 'user', content: `Read this file and summarize the key information:\n\n${fileInput}` },
            { role: 'assistant', content: fileContent },
          ],
        });
        break;
      }
      case 'api_call': {
        const apiInput = action.metadata?.input as string ?? action.description;
        const apiResponse = action.metadata?.output as string ?? action.metadata?.response as string ?? `Completed: ${action.description}`;
        examples.push({
          messages: [
            { role: 'system', content: 'You are an AI agent that queries APIs and interprets responses. Report findings accurately.' },
            { role: 'user', content: `Query this endpoint and interpret the result:\n\n${apiInput}` },
            { role: 'assistant', content: apiResponse },
          ],
        });
        break;
      }
      case 'output': {
        const outputInput = action.metadata?.input as string ?? action.description;
        const outputContent = action.metadata?.output as string ?? action.metadata?.content as string ?? `Completed: ${action.description}`;
        examples.push({
          messages: [
            { role: 'system', content: 'You are an AI agent producing verified outputs. Provide clear, actionable results.' },
            { role: 'user', content: outputInput },
            { role: 'assistant', content: outputContent },
          ],
        });
        break;
      }
      case 'context_read': {
        const src = action.metadata?.input as string ?? action.description;
        const ctx = action.metadata?.output as string ?? `Completed: ${action.description}`;
        examples.push({
          messages: [
            { role: 'system', content: 'You are an AI agent reading context for a task. Extract and summarize the relevant information.' },
            { role: 'user', content: `Read context from: ${src}` },
            { role: 'assistant', content: ctx },
          ],
        });
        break;
      }
      case 'tool_call': {
        const tool = action.metadata?.input as string ?? action.description;
        const input = action.metadata?.output as string ?? `Completed: ${action.description}`;
        examples.push({
          messages: [
            { role: 'system', content: 'You are an AI agent selecting and calling tools. Explain which tool you chose and why.' },
            { role: 'user', content: `Call tool: ${tool}` },
            { role: 'assistant', content: input },
          ],
        });
        break;
      }
      case 'tool_result': {
        const tool = action.metadata?.input as string ?? action.description;
        const result = action.metadata?.output as string ?? `Completed: ${action.description}`;
        examples.push({
          messages: [
            { role: 'system', content: 'You are an AI agent interpreting tool results. Summarize what the tool returned and its significance.' },
            { role: 'user', content: `Interpret result from: ${tool}` },
            { role: 'assistant', content: result },
          ],
        });
        break;
      }
      case 'message_send': {
        const recipient = action.metadata?.input as string ?? action.description;
        const msg = action.metadata?.output as string ?? `Completed: ${action.description}`;
        examples.push({
          messages: [
            { role: 'system', content: 'You are an AI agent communicating results. Be clear, concise, and actionable.' },
            { role: 'user', content: `Send message to: ${recipient}` },
            { role: 'assistant', content: msg },
          ],
        });
        break;
      }
    }
  }

  return examples;
}

export function trainingDataToJsonl(examples: TrainingExample[]): string {
  return examples.map((ex) => JSON.stringify(ex)).join('\n');
}

export function chainToFineTuningDataset(
  receipts: Receipt[],
  agentId: string,
): { jsonl: string; stats: { total: number; byType: Record<string, number> } } {
  const examples = receiptsToTrainingData(receipts);
  const jsonl = trainingDataToJsonl(examples);

  const byType: Record<string, number> = {};
  for (const receipt of receipts) {
    byType[receipt.action.type] = (byType[receipt.action.type] ?? 0) + 1;
  }

  return {
    jsonl,
    stats: { total: examples.length, byType },
  };
}
