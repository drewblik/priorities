import type { Metadata, Viewport } from 'next';
import './globals.css';
import { CostCapBanner } from './CostCapBanner';
import { MasterChatButton } from './MasterChatButton';
import { ServiceWorkerRegistrar } from './ServiceWorkerRegistrar';

export const metadata: Metadata = {
  title: 'Priorities',
  description: 'Your priorities, planned by their advocates.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Priorities',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#3b82f6',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <CostCapBanner />
        {children}
        <MasterChatButton />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
