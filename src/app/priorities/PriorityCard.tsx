import type { Priority } from '@/db/schema';

const STATUS_STYLES: Record<string, string> = {
  active: 'border-green-600/30 bg-green-600/5 text-green-700',
  paused: 'border-amber-600/30 bg-amber-600/5 text-amber-700',
  archived: 'border-border bg-muted text-muted-foreground',
};

const STYLE_FONT: Record<string, string> = {
  classic: 'ui-sans-serif, system-ui, sans-serif',
  rounded:
    'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", Quicksand, Comfortaa, sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  script: '"Snell Roundhand", "Apple Chancery", "Brush Script MT", cursive',
};

function formatMinutes(min: number, max: number): string {
  if (min === 0 && max === 0) return 'No weekly target set';
  if (min === max) return `${min} min/week`;
  return `${min}–${max} min/week`;
}

export function PriorityCard({
  priority,
  scheduledMinutes = 0,
}: {
  priority: Priority;
  scheduledMinutes?: number;
}) {
  const statusClass = STATUS_STYLES[priority.status] ?? STATUS_STYLES.archived;
  const hasTarget = priority.minMinutesPerWeek > 0 || priority.maxMinutesPerWeek > 0;
  const target = priority.maxMinutesPerWeek || priority.minMinutesPerWeek || 0;
  const pct = target > 0 ? Math.min(1, scheduledMinutes / target) : 0;
  const metMin =
    priority.minMinutesPerWeek > 0 && scheduledMinutes >= priority.minMinutesPerWeek;
  const icon = priority.icon ?? { color: '#3b82f6', style: 'classic' };
  const fontFamily = STYLE_FONT[icon.style] ?? STYLE_FONT.classic;

  return (
    <article className="flex items-start gap-3 rounded-md border border-border bg-background px-4 py-3">
      <span
        aria-hidden
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-2xl font-semibold leading-none"
        style={{ color: icon.color, fontFamily }}
      >
        P
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-medium text-foreground">{priority.name}</h3>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusClass}`}
          >
            {priority.status}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatMinutes(priority.minMinutesPerWeek, priority.maxMinutesPerWeek)}
        </p>
        {hasTarget ? (
          <div className="mt-1.5 space-y-1">
            <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
              <span>This week</span>
              <span className={metMin ? 'text-green-700' : ''}>
                {scheduledMinutes} min scheduled
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full ${metMin ? 'bg-green-600' : 'bg-primary'}`}
                style={{ width: `${pct * 100}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}
