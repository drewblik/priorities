import { requireUser } from '@/auth';
import { getSettingsView } from '@/lib/settings';

type SearchParams = { [key: string]: string | string[] | undefined };

const ERROR_COPY: Record<string, string> = {
  validation_failed: 'That looked off. Check the time and day-of-week values and try again.',
  save_failed: "We couldn't save your planning preferences. Try again in a moment.",
};

const DAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
] as const;

export default async function PlanningSettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireUser();
  const view = await getSettingsView(session.user.id);
  const params = await searchParams;

  const saved = params.saved === '1';
  const errorCode = typeof params.error === 'string' ? params.error : null;
  const errorMessage = errorCode ? (ERROR_COPY[errorCode] ?? 'Something went wrong.') : null;

  // The DB column type is `time` which Drizzle returns as 'HH:MM:SS'. The
  // `<input type="time">` element wants 'HH:MM'. Strip seconds for the form,
  // and the API route trims them on the way back in.
  const eveningRaw = view?.eveningReviewTime ?? '20:00:00';
  const eveningHM = eveningRaw.length >= 5 ? eveningRaw.slice(0, 5) : eveningRaw;
  const planningDay = view?.planningDayOfWeek ?? 0;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Planning preferences</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Anchors for the upcoming evening-review and weekly-plan banners.
          The Daily Plan chatbot uses these to surface a nudge at the right
          time.
        </p>
      </div>

      {saved ? (
        <div
          className="rounded-md border border-green-600/30 bg-green-600/5 px-3 py-2 text-sm text-green-700"
          role="status"
        >
          Saved.
        </div>
      ) : null}
      {errorMessage ? (
        <div
          className="rounded-md border border-red-600/30 bg-red-600/5 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      <form method="post" action="/api/settings" className="space-y-4">
        <input type="hidden" name="_redirect" value="/settings/planning" />

        <label className="block space-y-1">
          <span className="text-sm font-medium">Evening review time</span>
          <input
            type="time"
            name="eveningReviewTime"
            defaultValue={eveningHM}
            required
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
          />
          <span className="block text-xs text-muted-foreground">
            When you usually want the &ldquo;Plan tomorrow&rdquo; nudge.
            Time is in your local timezone ({session.user.timezone}).
          </span>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Default planning day of week</span>
          <select
            name="planningDayOfWeek"
            defaultValue={planningDay}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
          >
            {DAYS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <span className="block text-xs text-muted-foreground">
            Day each week you do your weekly planning ritual. The
            &ldquo;Plan week&rdquo; nudge will appear the evening of the
            day before.
          </span>
        </label>

        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Save changes
        </button>
      </form>

      <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        Banner triggers (the actual evening / weekly nudge UI) land with
        M18&apos;s onboarding banner system. Until then, the values above
        are stored but only used by the Daily Plan flow when you tap
        &ldquo;Plan tomorrow&rdquo; manually.
      </div>
    </section>
  );
}
