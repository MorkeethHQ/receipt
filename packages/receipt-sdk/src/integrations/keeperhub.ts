// ---------------------------------------------------------------------------
// KeeperHub SDK integration for RECEIPT
// ---------------------------------------------------------------------------

export interface KeeperHubConfig {
  apiKey: string;
  baseUrl?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
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

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface KeeperHubClient {
  /** Create a new workflow with the given nodes and edges */
  createWorkflow(name: string, nodes: WorkflowNode[], edges: WorkflowEdge[]): Promise<Workflow>;
  /** Schedule a workflow to run on a cron expression */
  scheduleAnchor(workflowId: string, cronExpression: string): Promise<void>;
  /** Trigger an immediate execution of a workflow */
  triggerAnchor(workflowId: string): Promise<void>;
  /** Get current workflow status */
  getWorkflowStatus(workflowId: string): Promise<Workflow>;
  /** List recent executions for a workflow */
  listExecutions(workflowId: string, limit?: number): Promise<WorkflowExecution[]>;
  /** Delete a workflow */
  deleteWorkflow(workflowId: string): Promise<void>;
  /** Pause a scheduled workflow */
  pauseWorkflow(workflowId: string): Promise<void>;
  /** Resume a paused workflow */
  resumeWorkflow(workflowId: string): Promise<void>;
}

export function createKeeperHubClient(config: KeeperHubConfig): KeeperHubClient {
  const baseUrl = config.baseUrl ?? 'https://api.keeperhub.xyz';
  const timeout = config.timeout ?? 30_000;

  async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(`${baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          ...options.headers,
        },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new KeeperHubError(
          `KeeperHub API error ${res.status}: ${body || res.statusText}`,
          res.status,
          body,
        );
      }

      // Some endpoints return 204 No Content
      if (res.status === 204) return undefined as T;

      return res.json() as Promise<T>;
    } catch (err) {
      if (err instanceof KeeperHubError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new KeeperHubError(`KeeperHub request timed out after ${timeout}ms`, 0, '');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async createWorkflow(name, nodes, edges) {
      return request<Workflow>('/api/workflows', {
        method: 'POST',
        body: JSON.stringify({ name, nodes, edges }),
      });
    },

    async scheduleAnchor(workflowId, cronExpression) {
      await request(`/api/workflows/${workflowId}/schedule`, {
        method: 'POST',
        body: JSON.stringify({ cron: cronExpression }),
      });
    },

    async triggerAnchor(workflowId) {
      await request(`/api/workflows/${workflowId}/trigger`, {
        method: 'POST',
      });
    },

    async getWorkflowStatus(workflowId) {
      return request<Workflow>(`/api/workflows/${workflowId}`);
    },

    async listExecutions(workflowId, limit = 10) {
      return request<WorkflowExecution[]>(
        `/api/workflows/${workflowId}/executions?limit=${limit}`,
      );
    },

    async deleteWorkflow(workflowId) {
      await request(`/api/workflows/${workflowId}`, { method: 'DELETE' });
    },

    async pauseWorkflow(workflowId) {
      await request(`/api/workflows/${workflowId}/pause`, { method: 'POST' });
    },

    async resumeWorkflow(workflowId) {
      await request(`/api/workflows/${workflowId}/resume`, { method: 'POST' });
    },
  };
}

// ---------------------------------------------------------------------------
// Error class for better error handling
// ---------------------------------------------------------------------------

export class KeeperHubError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(message);
    this.name = 'KeeperHubError';
  }
}
