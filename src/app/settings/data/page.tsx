import { requireUser } from '@/auth';

export default async function DataSettingsPage() {
  await requireUser();
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Data</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Export everything you&apos;ve created — priorities, memory, tasks,
          events, calendar feeds, quarters, and chat history — as a single
          JSON file.
        </p>
      </div>

      <div className="space-y-2 rounded-md border border-border bg-background p-4">
        <p className="text-sm">
          The export includes soft-deleted rows (so it doubles as recovery
          for anything you removed). Your Anthropic API key and calendar
          feed URLs are redacted.
        </p>
        <a
          href="/api/export"
          className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          download
        >
          Export all data
        </a>
      </div>

      <p className="text-xs text-muted-foreground">
        There is no in-app import or trash UI in v1 — keep the export file
        if you want a restore point.
      </p>
    </section>
  );
}
