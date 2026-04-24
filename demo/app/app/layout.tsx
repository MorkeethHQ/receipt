import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RECEIPT — Proof Layer for Agent Work',
  description: 'Signed, hash-linked receipts for verifiable AI agent handoffs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
