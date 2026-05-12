import type { Metadata, Viewport } from 'next';
import './globals.css';
import { MasterChatButton } from './MasterChatButton';

export const metadata: Metadata = {
  title: 'Priorities',
  description: 'Your priorities, planned by their advocates.',
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
        {children}
        <MasterChatButton />
      </body>
    </html>
  );
}
