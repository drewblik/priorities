import { formatInTimeZone } from 'date-fns-tz';
import { requireUser } from '@/auth';
import { getFeedsForUser, type CalendarFeedConfigView } from '@/lib/calendar-feeds';
import { SyncButton } from './SyncButton';

type SearchParams = { [key: string]: string | string[] | undefined };

const TOAST_COPY: Record<string, { tone: 'success' | 'error'; message: string }> = {
  feed_added: { tone: 'success', message: 'Calendar feed added.' },
  feed_saved: { tone: 'success', message: 'Calendar feed updated.' },
  feed_deleted: { tone: 'success', message: 'Calendar feed removed.' },
  feed_synced: { tone: 'success', message: 'Synced. Refreshing list.' },
  validation_failed: {
    tone: 'error',
    message: "Some fields weren't valid. Check the values and try again.",
  },
  save_failed: { tone: 'error', message: "We couldn't save your changes. Try again." },
  not_found: { tone: 'error', message: 'That feed could not be found.' },
  sync_failed: { tone: 'error', message: 'Sync failed.' },
};

export default async function CalendarSettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireUser();
  const sp = await searchParams;
  const feeds = await getFeedsForUser(session.user.id);

  const toast = (() => {
    for (const key of Object.keys(TOAST_COPY)) {
      if (sp[key] === '1') return TOAST_COPY[key];
    }
    if (typeof sp.error === 'string') {
      const base = TOAST_COPY[sp.error] ?? {
        tone: 'error' as const,
        message: 'Something went wrong.',
      };
      const detail = typeof sp.validation_issue === 'string' ? sp.validation_issue : '';
      return detail ? { tone: base.tone, message: `${base.message} (${detail})` } : base;
    }
    return null;
  })();

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-medium">Calendar</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Subscribe to read-only .ics calendar feeds. Events appear on your Daily View as gray
          immutable blocks. Feeds sync automatically every {30} minutes (per-feed override
          available below).
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Feed URLs are encrypted at rest — many private calendar share links embed an auth
          token in the URL.
        </p>
      </div>

      {toast ? (
        <div
          role={toast.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-md border px-3 py-2 text-sm ${
            toast.tone === 'success'
              ? 'border-green-600/30 bg-green-600/5 text-green-700'
              : 'border-red-600/30 bg-red-600/5 text-red-700'
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <details open className="rounded-md border border-border bg-background p-4">
        <summary className="cursor-pointer select-none text-base font-medium">
          Add a feed
        </summary>
        <form method="post" action="/api/calendar-feeds" className="mt-3 space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">
              Name <span className="text-red-700">*</span>
            </span>
            <input
              type="text"
              name="name"
              required
              maxLength={120}
              placeholder="e.g. Work calendar"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">
              Source <span className="text-red-700">*</span>
            </span>
            <select
              name="source"
              required
              defaultValue="google"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
            >
              <option value="google">Google</option>
              <option value="outlook">Outlook</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">
              .ics URL <span className="text-red-700">*</span>
            </span>
            <input
              type="url"
              name="feedUrl"
              required
              maxLength={2000}
              placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
            />
            <span className="text-xs text-muted-foreground">
              Google: Settings → your calendar → &quot;Secret address in iCal format&quot;.
              Outlook: Calendar settings → Shared calendars → publish as ICS.
            </span>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Sync cadence (minutes)</span>
            <input
              type="number"
              name="syncCadenceMin"
              min={5}
              max={1440}
              defaultValue={30}
              className="w-32 rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Add feed
          </button>
        </form>
      </details>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Your feeds ({feeds.length})
          </h3>
          {feeds.length > 0 ? <SyncButton scope="all" /> : null}
        </div>
        {feeds.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            No feeds yet. Add one above.
          </p>
        ) : (
          <ul className="space-y-2">
            {feeds.map((feed) => (
              <li key={feed.id}>
                <FeedRow feed={feed} userTimezone={session.user.timezone} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

function FeedRow({
  feed,
  userTimezone,
}: {
  feed: CalendarFeedConfigView;
  userTimezone: string;
}) {
  const lastSynced = feed.lastSyncedAt
    ? formatInTimeZone(feed.lastSyncedAt, userTimezone, 'LLL d, h:mm a')
    : 'never';
  return (
    <article className="space-y-2 rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-medium">{feed.name}</h4>
        <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {feed.source}
        </span>
        <span className="text-xs text-muted-foreground">{feed.feedUrlPreview}</span>
      </div>

      <div className="text-xs text-muted-foreground">
        Last synced: {lastSynced} · Cadence: {feed.syncCadenceMin}m
      </div>
      {feed.lastSyncError ? (
        <div className="rounded-md border border-red-600/30 bg-red-600/5 px-2 py-1 text-xs text-red-700">
          Last sync error: {feed.lastSyncError}
        </div>
      ) : null}

      <details className="rounded border border-border/60 px-2 py-1">
        <summary className="cursor-pointer select-none text-xs text-muted-foreground">
          Edit name / URL / cadence
        </summary>
        <form
          method="post"
          action={`/api/calendar-feeds/${feed.id}`}
          className="mt-2 space-y-2"
        >
          <input
            type="text"
            name="name"
            defaultValue={feed.name}
            maxLength={120}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <input
            type="url"
            name="feedUrl"
            placeholder="Paste a new URL to replace (leave blank to keep current)"
            maxLength={2000}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <input
            type="number"
            name="syncCadenceMin"
            min={5}
            max={1440}
            defaultValue={feed.syncCadenceMin}
            className="w-32 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
          >
            Save changes
          </button>
        </form>
      </details>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <SyncButton scope="feed" feedId={feed.id} />
        <form
          method="post"
          action={`/api/calendar-feeds/${feed.id}`}
          // eslint-disable-next-line react/no-danger-with-children
        >
          <input type="hidden" name="_action" value="delete" />
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1.5 text-xs text-red-700 hover:bg-muted"
            data-confirm-delete
          >
            Delete
          </button>
        </form>
      </div>
    </article>
  );
}
