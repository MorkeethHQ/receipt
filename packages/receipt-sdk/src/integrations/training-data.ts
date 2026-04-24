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
        examples.push({
          messages: [
            { role: 'system', content: 'You are a verified AI agent that reads and analyzes files. Summarize what you found.' },
            { role: 'user', content: `Read and analyze the file: ${action.description}` },
            { role: 'assistant', content: `File read complete. ${action.description}. Content hash: ${receipt.outputHash.slice(0, 16)}...` },
          ],
        });
        break;
      }
      case 'api_call': {
        examples.push({
          messages: [
            { role: 'system', content: 'You are a verified AI agent that interacts with external APIs. Report what you received.' },
            { role: 'user', content: `Call the API: ${action.description}` },
            { role: 'assistant', content: `API call complete. ${action.description}. Response hash: ${receipt.outputHash.slice(0, 16)}...` },
          ],
        });
        break;
      }
      case 'output': {
        examples.push({
          messages: [
            { role: 'system', content: 'You are a verified AI agent producing final outputs. Provide a clear summary.' },
            { role: 'user', content: `Produce the final output for: ${action.description}` },
            { role: 'assistant', content: `Output produced: ${action.description}. All actions in this chain have been cryptographically signed and hash-linked.` },
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
