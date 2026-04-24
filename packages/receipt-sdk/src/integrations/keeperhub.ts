export interface KeeperHubConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface WorkflowNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  source: string;
  target: string;
}

export interface Workflow {
  id: string;
  name: string;
  status: string;
}

export function createKeeperHubClient(config: KeeperHubConfig) {
  const baseUrl = config.baseUrl ?? 'https://api.keeperhub.xyz';

  async function request(path: string, options: RequestInit = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        ...options.headers,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`KeeperHub API error ${res.status}: ${body}`);
    }
    return res.json() as Promise<any>;
  }

  return {
    async createWorkflow(name: string, nodes: WorkflowNode[], edges: WorkflowEdge[]): Promise<Workflow> {
      return request('/api/workflows', {
        method: 'POST',
        body: JSON.stringify({ name, nodes, edges }),
      });
    },

    async scheduleAnchor(workflowId: string, cronExpression: string): Promise<void> {
      await request(`/api/workflows/${workflowId}/schedule`, {
        method: 'POST',
        body: JSON.stringify({ cron: cronExpression }),
      });
    },

    async triggerAnchor(workflowId: string): Promise<void> {
      await request(`/api/workflows/${workflowId}/trigger`, {
        method: 'POST',
      });
    },

    async getWorkflowStatus(workflowId: string): Promise<Workflow> {
      return request(`/api/workflows/${workflowId}`);
    },
  };
}
