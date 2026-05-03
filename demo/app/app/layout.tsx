import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'R.E.C.E.I.P.T. - Proof Layer for Agent Work',
  description: 'Two-layer proof for AI agent work: tamper-proof receipt chains (ed25519 + SHA-256) with TEE-attested usefulness scoring via 0G Compute.',
  openGraph: {
    title: 'R.E.C.E.I.P.T.',
    description: 'Cryptographic proof layer for AI agents. Every action signed, every output verified, on-chain.',
    type: 'website',
    url: 'https://receipt-murex.vercel.app',
  },
  twitter: {
    card: 'summary',
    title: 'R.E.C.E.I.P.T.',
    description: 'Cryptographic proof layer for AI agents. Every action signed, every output verified, on-chain.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#f5f3ef" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
