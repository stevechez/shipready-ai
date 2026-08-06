import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ShipReady AI',
  description: 'Production readiness verification for AI-generated software.',
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
