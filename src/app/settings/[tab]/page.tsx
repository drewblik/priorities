import { redirect } from 'next/navigation';
import { requireUser } from '@/auth';

const PLACEHOLDERS: Record<string, { label: string; comingIn: string; description: string }> = {
  data: {
    label: 'Data',
    comingIn: 'M19',
    description: 'Export everything (priorities, tasks, events, chat history) as JSON.',
  },
};

export default async function SettingsTabFallbackPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  await requireUser();
  const { tab } = await params;
  const placeholder = PLACEHOLDERS[tab];
  if (!placeholder) redirect('/settings/profile');

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-medium">{placeholder.label}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{placeholder.description}</p>
      </div>
      <div className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
        Coming in <span className="font-medium text-foreground">{placeholder.comingIn}</span>.
      </div>
    </section>
  );
}
