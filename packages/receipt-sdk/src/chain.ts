import { hash } from './crypto';
import type { Receipt, HandoffBundle } from './types';

export class ReceiptChain {
  private receipts: Receipt[] = [];

  static fromReceipts(receipts: Receipt[]): ReceiptChain {
    const chain = new ReceiptChain();
    for (const receipt of receipts) {
      chain.append(receipt);
    }
    return chain;
  }

  append(receipt: Receipt): void {
    const expectedPrevId = this.receipts.length > 0
      ? this.receipts[this.receipts.length - 1].id
      : null;

    if (receipt.prevId !== expectedPrevId) {
      throw new Error(
        `Chain linkage broken: expected prevId=${expectedPrevId}, got prevId=${receipt.prevId}`
      );
    }

    this.receipts.push(receipt);
  }

  getLastId(): string | null {
    if (this.receipts.length === 0) return null;
    return this.receipts[this.receipts.length - 1].id;
  }

  getReceipts(): Receipt[] {
    return [...this.receipts];
  }

  length(): number {
    return this.receipts.length;
  }

  computeRootHash(): string {
    if (this.receipts.length === 0) {
      throw new Error('Cannot compute root hash of empty chain');
    }
    const last = this.receipts[this.receipts.length - 1];
    return hash(`${last.id}:${last.inputHash}:${last.outputHash}:${last.signature}`);
  }

  toHandoffBundle(agentId: string, storageRef: string | null = null): HandoffBundle {
    return {
      chainRootHash: this.computeRootHash(),
      receipts: this.getReceipts(),
      agentId,
      timestamp: Date.now(),
      storageRef,
    };
  }

  serialize(): string {
    return JSON.stringify(this.receipts);
  }

  static deserialize(json: string): ReceiptChain {
    const receipts: Receipt[] = JSON.parse(json);
    return ReceiptChain.fromReceipts(receipts);
  }
}
