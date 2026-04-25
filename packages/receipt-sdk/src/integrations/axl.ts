import type { HandoffBundle } from '../types';
import { publicKeyToHex } from '../crypto';

export interface AxlConfig {
  baseUrl?: string;
}

export interface AxlPeerInfo {
  peerId: string;
  publicKey: string;
  peers: string[];
}

export interface AxlMessage {
  fromPeerId: string;
  data: Uint8Array;
}

/** Bundle sent over AXL including the sender's ed25519 public key for verification. */
export interface AxlHandoffPayload {
  bundle: HandoffBundle;
  senderPublicKey: string;
}

export function createAxlClient(config?: AxlConfig) {
  const baseUrl = config?.baseUrl ?? 'http://127.0.0.1:9002';

  return {
    async topology(): Promise<AxlPeerInfo> {
      const res = await fetch(`${baseUrl}/topology`);
      if (!res.ok) throw new Error(`AXL topology error: ${res.status}`);
      const data: any = await res.json();
      return {
        peerId: data.our_ipv6 ?? data.peerId ?? '',
        publicKey: data.our_public_key ?? '',
        peers: (data.peers ?? [])
          .filter((p: any) => p.up !== false)
          .map((p: any) => p.public_key ?? p),
      };
    },

    async send(peerId: string, data: Uint8Array): Promise<void> {
      const res = await fetch(`${baseUrl}/send`, {
        method: 'POST',
        headers: { 'X-Destination-Peer-Id': peerId },
        body: data as any,
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

/**
 * AxlTransport — class-based wrapper for Gensyn AXL P2P agent communication.
 *
 * Provides high-level methods for discovering peers, sending receipt handoff
 * bundles (with the sender's ed25519 public key), and receiving/polling for
 * incoming handoffs. Handles connection errors gracefully.
 */
export class AxlTransport {
  private readonly baseUrl: string;
  private connected = false;

  constructor(config?: AxlConfig) {
    this.baseUrl = config?.baseUrl ?? 'http://127.0.0.1:9002';
  }

  /** Check whether the AXL node is reachable. */
  async connect(): Promise<AxlPeerInfo> {
    try {
      const info = await this.getNodeInfo();
      this.connected = true;
      return info;
    } catch (err: any) {
      this.connected = false;
      throw new Error(`AXL connection failed (${this.baseUrl}): ${err.message}`);
    }
  }

  /** Get this node's peer ID and public key. */
  async getNodeInfo(): Promise<AxlPeerInfo> {
    const res = await this.fetchSafe(`${this.baseUrl}/topology`);
    const data: any = await res.json();
    return {
      peerId: data.our_ipv6 ?? data.peerId ?? '',
      publicKey: data.our_public_key ?? '',
      peers: (data.peers ?? [])
        .filter((p: any) => p.up !== false)
        .map((p: any) => p.public_key ?? p),
    };
  }

  /** List available peers on the AXL network. */
  async discoverPeers(): Promise<string[]> {
    const info = await this.getNodeInfo();
    return info.peers;
  }

  /**
   * Send a handoff bundle to a peer via AXL.
   * Includes the sender's ed25519 public key so the receiver can verify signatures.
   */
  async sendHandoff(
    peerId: string,
    receipts: import('../types').Receipt[],
    publicKey: Uint8Array,
    bundle: HandoffBundle,
  ): Promise<void> {
    const payload: AxlHandoffPayload = {
      bundle: {
        ...bundle,
        receipts,
      },
      senderPublicKey: publicKeyToHex(publicKey),
    };

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(payload));

    const res = await this.fetchSafe(`${this.baseUrl}/send`, {
      method: 'POST',
      headers: { 'X-Destination-Peer-Id': peerId },
      body: data,
    });
    if (!res.ok) throw new Error(`AXL send error: ${res.status}`);
  }

  /**
   * Poll for an incoming receipt handoff from AXL.
   * Returns null if no message is available.
   */
  async receiveHandoff(): Promise<{
    fromPeerId: string;
    bundle: HandoffBundle;
    senderPublicKey: string;
  } | null> {
    const res = await fetch(`${this.baseUrl}/recv`);
    if (res.status === 204 || res.status === 404) return null;
    if (!res.ok) throw new Error(`AXL recv error: ${res.status}`);

    const fromPeerId = res.headers.get('X-From-Peer-Id') ?? 'unknown';
    const raw = new Uint8Array(await res.arrayBuffer());
    const decoder = new TextDecoder();
    const parsed = JSON.parse(decoder.decode(raw));

    // Support both AxlHandoffPayload (with senderPublicKey) and legacy HandoffBundle
    if (parsed.senderPublicKey && parsed.bundle) {
      const payload = parsed as AxlHandoffPayload;
      return {
        fromPeerId,
        bundle: payload.bundle,
        senderPublicKey: payload.senderPublicKey,
      };
    }

    // Legacy format — no sender key
    return {
      fromPeerId,
      bundle: parsed as HandoffBundle,
      senderPublicKey: '',
    };
  }

  /**
   * Wait for a handoff bundle, polling until one arrives or the timeout expires.
   * @param timeoutMs Maximum time to wait in milliseconds (default 30s)
   * @param pollIntervalMs How often to poll (default 500ms)
   */
  async waitForHandoff(
    timeoutMs = 30000,
    pollIntervalMs = 500,
  ): Promise<{
    fromPeerId: string;
    bundle: HandoffBundle;
    senderPublicKey: string;
  }> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const result = await this.receiveHandoff();
        if (result) return result;
      } catch {
        // AXL node may not be ready yet — keep polling
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    throw new Error(`Timeout waiting for AXL handoff after ${timeoutMs}ms`);
  }

  /**
   * Send a handoff bundle via A2A protocol envelope.
   * Routes through AXL's multiplexer to the peer's A2A server.
   */
  async sendHandoffA2A(
    peerId: string,
    receipts: import('../types').Receipt[],
    publicKey: Uint8Array,
    bundle: HandoffBundle,
  ): Promise<any> {
    const payload: AxlHandoffPayload = {
      bundle: { ...bundle, receipts },
      senderPublicKey: publicKeyToHex(publicKey),
    };

    const a2aEnvelope = {
      a2a: true,
      request: {
        jsonrpc: '2.0',
        method: 'SendMessage',
        id: Date.now().toString(),
        params: {
          message: {
            role: 'user',
            parts: [{
              type: 'data',
              data: payload,
            }],
          },
        },
      },
    };

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(a2aEnvelope));

    const res = await this.fetchSafe(`${this.baseUrl}/send`, {
      method: 'POST',
      headers: { 'X-Destination-Peer-Id': peerId },
      body: data,
    });
    if (!res.ok) throw new Error(`AXL A2A send error: ${res.status}`);
    return a2aEnvelope;
  }

  /**
   * Receive a handoff via A2A protocol envelope.
   * Unwraps the A2A envelope to extract the receipt bundle.
   */
  async receiveHandoffA2A(): Promise<{
    fromPeerId: string;
    bundle: HandoffBundle;
    senderPublicKey: string;
  } | null> {
    const res = await fetch(`${this.baseUrl}/recv`);
    if (res.status === 204 || res.status === 404) return null;
    if (!res.ok) throw new Error(`AXL A2A recv error: ${res.status}`);

    const fromPeerId = res.headers.get('X-From-Peer-Id') ?? 'unknown';
    const raw = new Uint8Array(await res.arrayBuffer());
    const decoder = new TextDecoder();
    const parsed = JSON.parse(decoder.decode(raw));

    // Unwrap A2A envelope
    if (parsed.a2a && parsed.request?.params?.message?.parts) {
      const dataPart = parsed.request.params.message.parts.find(
        (p: any) => p.type === 'data',
      );
      if (dataPart?.data) {
        const payload = dataPart.data as AxlHandoffPayload;
        return {
          fromPeerId,
          bundle: payload.bundle,
          senderPublicKey: payload.senderPublicKey,
        };
      }
    }

    // Unwrap standard AxlHandoffPayload
    if (parsed.senderPublicKey && parsed.bundle) {
      return {
        fromPeerId,
        bundle: parsed.bundle,
        senderPublicKey: parsed.senderPublicKey,
      };
    }

    // Legacy format
    return {
      fromPeerId,
      bundle: parsed as HandoffBundle,
      senderPublicKey: '',
    };
  }

  /**
   * Send an MCP tool call to a remote peer's MCP service.
   * Uses the /mcp/{peer_id}/{service} endpoint for synchronous request-response.
   */
  async callMcpTool(
    peerId: string,
    service: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<any> {
    const body = {
      jsonrpc: '2.0',
      method: 'tools/call',
      id: Date.now().toString(),
      params: {
        name: toolName,
        arguments: args,
      },
    };

    const res = await this.fetchSafe(`${this.baseUrl}/mcp/${peerId}/${service}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`AXL MCP call error: ${res.status}`);
    return res.json();
  }

  /**
   * Fetch a remote peer's A2A agent card.
   * Returns the peer's capabilities and supported skills.
   */
  async getAgentCard(peerId: string): Promise<any> {
    const res = await this.fetchSafe(`${this.baseUrl}/a2a/${peerId}`);
    if (!res.ok) throw new Error(`AXL A2A agent card error: ${res.status}`);
    return res.json();
  }

  /**
   * Broadcast a handoff bundle to ALL discovered peers via A2A.
   * Returns results for each peer (success or error).
   */
  async broadcastHandoff(
    receipts: import('../types').Receipt[],
    publicKey: Uint8Array,
    bundle: HandoffBundle,
  ): Promise<{ peerId: string; success: boolean; error?: string }[]> {
    const peers = await this.discoverPeers();
    const results = [];

    for (const peerId of peers) {
      try {
        await this.sendHandoffA2A(peerId, receipts, publicKey, bundle);
        results.push({ peerId, success: true });
      } catch (err: any) {
        results.push({ peerId, success: false, error: err.message });
      }
    }

    return results;
  }

  /** Fetch with graceful connection error handling. */
  private async fetchSafe(url: string, init?: RequestInit): Promise<Response> {
    try {
      const res = await fetch(url, init);
      return res;
    } catch (err: any) {
      if (err.cause?.code === 'ECONNREFUSED') {
        throw new Error(
          `Cannot reach AXL node at ${this.baseUrl}. ` +
          `Make sure the AXL binary is running (see demo/axl/README.md).`,
        );
      }
      throw new Error(`AXL network error: ${err.message}`);
    }
  }
}
