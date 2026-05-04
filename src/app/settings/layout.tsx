import Link from 'next/link';
import { requireUser } from '@/auth';
import { SettingsTabs } from './SettingsTabs';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Home
        </Link>
      </header>

      <SettingsTabs />

      <div className="mt-6">{children}</div>
    </main>
  );
}
