import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'R.E.C.E.I.P.T. — Record of Every Computational Event with Immutable Proof and Trust',
  description: 'Proof layer for agent work — signed, hash-linked receipts for verifiable AI agent handoffs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
