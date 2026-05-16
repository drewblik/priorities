import { requireUser } from '@/auth';
import { getCostBreakdown, getCostStatus } from '@/lib/cost-cap';
import { SaveCapsButton } from './SaveCapsButton';

type SearchParams = { [key: string]: string | string[] | undefined };

const SESSION_TYPE_LABEL: Record<string, string> = {
  quarter: 'Quarter planning',
  weekly: 'Weekly planning',
  daily: 'Daily planning',
  master: 'Master chat',
  onboarding: 'Onboarding',
  creation: 'Priority creation',
};

function usd(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

function Bar({ pct, blocked }: { pct: number; blocked: boolean }) {
  const clamped = Math.min(1, Math.max(0, pct));
  const color = blocked
    ? 'bg-red-600'
    : pct >= 0.8
      ? 'bg-amber-500'
      : 'bg-primary';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full ${color}`} style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}

export default async function CostSettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireUser();
  const sp = await searchParams;
  const saved = sp.saved === '1';
  const errored = typeof sp.error === 'string';

  const [status, breakdown] = await Promise.all([
    getCostStatus(session.user.id),
    getCostBreakdown(session.user.id),
  ]);

  const maxTrend = Math.max(0.0001, ...breakdown.trend.map((t) => t.usd));

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Cost &amp; Usage</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Spend is tracked per AI call against your daily and monthly caps.
          AI features pause automatically when a cap is reached.
        </p>
      </div>

      {saved ? (
        <div className="rounded-md border border-green-600/30 bg-green-600/5 px-3 py-2 text-sm text-green-700">
          Caps updated.
        </div>
      ) : null}
      {errored ? (
        <div className="rounded-md border border-red-600/30 bg-red-600/5 px-3 py-2 text-sm text-red-700">
          Couldn&apos;t update caps. Check the values and try again.
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="space-y-1">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">Today</span>
            <span className="text-muted-foreground">
              {usd(status.todayUsd)} / {usd(status.dailyCapUsd)}
            </span>
          </div>
          <Bar pct={status.dailyPct} blocked={status.dailyPct >= 1} />
        </div>
        <div className="space-y-1">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">This month</span>
            <span className="text-muted-foreground">
              {usd(status.monthUsd)} / {usd(status.monthlyCapUsd)}
            </span>
          </div>
          <Bar pct={status.monthlyPct} blocked={status.monthlyPct >= 1} />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Last 30 days</h3>
        {breakdown.trend.length === 0 ? (
          <p className="text-sm text-muted-foreground">No spend yet.</p>
        ) : (
          <div className="flex h-20 items-end gap-[2px]">
            {breakdown.trend.map((t) => (
              <div
                key={t.date}
                title={`${t.date}: ${usd(t.usd)}`}
                className="flex-1 rounded-sm bg-primary/60"
                style={{ height: `${Math.max(2, (t.usd / maxTrend) * 100)}%` }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">By activity</h3>
        {breakdown.byType.length === 0 ? (
          <p className="text-sm text-muted-foreground">No spend yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {breakdown.byType.map((r) => (
              <li
                key={r.sessionType}
                className="flex items-baseline justify-between rounded-md border border-border bg-background px-3 py-2"
              >
                <span>{SESSION_TYPE_LABEL[r.sessionType] ?? r.sessionType}</span>
                <span className="text-muted-foreground">{usd(r.totalUsd)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        method="post"
        action="/api/settings"
        className="space-y-3 border-t border-border pt-4"
      >
        <input type="hidden" name="_redirect" value="/settings/cost" />
        <h3 className="text-sm font-medium">Adjust caps</h3>
        <p className="text-xs text-muted-foreground">
          Raising a cap takes effect immediately and unpauses AI if you were
          blocked. Lowering it can pause AI right away.
        </p>
        <label className="block space-y-1">
          <span className="text-sm">Daily cap (USD)</span>
          <input
            type="number"
            name="dailyCostCapUsd"
            min={0}
            max={10000}
            step="0.01"
            defaultValue={status.dailyCapUsd}
            className="w-32 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Monthly cap (USD)</span>
          <input
            type="number"
            name="monthlyCostCapUsd"
            min={0}
            max={100000}
            step="0.01"
            defaultValue={status.monthlyCapUsd}
            className="w-32 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
          />
        </label>
        <SaveCapsButton />
      </form>
    </section>
  );
}
