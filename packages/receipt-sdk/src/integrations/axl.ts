import type { HandoffBundle } from '../types';

export interface AxlConfig {
  baseUrl?: string;
}

export interface AxlPeerInfo {
  peerId: string;
  peers: string[];
}

export interface AxlMessage {
  fromPeerId: string;
  data: Uint8Array;
}

export function createAxlClient(config?: AxlConfig) {
  const baseUrl = config?.baseUrl ?? 'http://127.0.0.1:9002';

  return {
    async topology(): Promise<AxlPeerInfo> {
      const res = await fetch(`${baseUrl}/topology`);
      if (!res.ok) throw new Error(`AXL topology error: ${res.status}`);
      return res.json() as Promise<AxlPeerInfo>;
    },

    async send(peerId: string, data: Uint8Array): Promise<void> {
      const res = await fetch(`${baseUrl}/send`, {
        method: 'POST',
        headers: { 'X-Destination-Peer-Id': peerId },
        body: data,
      });
      if (!res.ok) throw new Error(`AXL send error: ${res.status}`);
    },

    async recv(): Promise<AxlMessage | null> {
      const res = await fetch(`${baseUrl}/recv`);
      if (res.status === 204) return null;
      if (!res.ok) throw new Error(`AXL recv error: ${res.status}`);

      const fromPeerId = res.headers.get('X-From-Peer-Id') ?? 'unknown';
      const data = new Uint8Array(await res.arrayBuffer());
      return { fromPeerId, data };
    },

    async sendHandoff(peerId: string, bundle: HandoffBundle): Promise<void> {
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(bundle));
      await this.send(peerId, data);
    },

    async recvHandoff(): Promise<{ fromPeerId: string; bundle: HandoffBundle } | null> {
      const msg = await this.recv();
      if (!msg) return null;
      const decoder = new TextDecoder();
      const bundle: HandoffBundle = JSON.parse(decoder.decode(msg.data));
      return { fromPeerId: msg.fromPeerId, bundle };
    },

    async waitForHandoff(timeoutMs = 30000): Promise<{ fromPeerId: string; bundle: HandoffBundle }> {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const result = await this.recvHandoff();
        if (result) return result;
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error('Timeout waiting for AXL handoff');
    },
  };
}
