'use client';

import Link from 'next/link';

export type DailyTaskRowProps = {
  kind: 'task';
  id: string;
  ownerPriorityId: string;
  title: string;
  description: string | null;
  status: 'open' | 'done' | 'skipped';
  timeRange: string | null;
  recurrenceLabel: string | null;
  isVirtual: boolean;
  priorityName: string;
  priorityColor: string;
  priorityPaused: boolean;
  redirectBack: string;
};

export type DailyEventRowProps = {
  kind: 'event';
  id: string;
  ownerPriorityId: string;
  title: string;
  description: string | null;
  timeRange: string;
  recurrenceLabel: string | null;
  isVirtual: boolean;
  completionStatus: 'attended' | 'missed' | null;
  priorityName: string;
  priorityColor: string;
  priorityPaused: boolean;
  redirectBack: string;
};

export type DailyFeedEventRowProps = {
  kind: 'feedEvent';
  id: string;
  title: string;
  description: string | null;
  timeRange: string;
  sourceName: string;
  isRemoved: boolean;
};

type Props = DailyTaskRowProps | DailyEventRowProps | DailyFeedEventRowProps;

const EVENT_STATUS_OPTIONS: { value: 'none' | 'attended' | 'missed'; label: string }[] = [
  { value: 'none', label: 'Not yet' },
  { value: 'attended', label: 'Attended' },
  { value: 'missed', label: 'Missed' },
];

export function DailyTimelineRow(props: Props) {
  if (props.kind === 'task') return <TaskBody {...props} />;
  if (props.kind === 'event') return <EventBody {...props} />;
  return <FeedEventBody {...props} />;
}

function HeaderLine({
  priorityName,
  priorityColor,
  priorityPaused,
  timeRange,
}: {
  priorityName: string;
  priorityColor: string;
  priorityPaused: boolean;
  timeRange: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: priorityColor }}
        />
        <span className="uppercase tracking-wide">{priorityName}</span>
        {priorityPaused ? <span className="text-amber-700">(paused)</span> : null}
      </span>
      {timeRange ? <span>· {timeRange}</span> : null}
    </div>
  );
}

function TaskBody(props: DailyTaskRowProps) {
  const completeAction = `/api/tasks/${props.id}/complete`;
  const taskAction = `/api/tasks/${props.id}`;
  // Pre-build a stable color border tone so the row reads as "owned by this priority".
  const borderStyle = { borderLeftColor: props.priorityColor };

  return (
    <article
      className="flex items-start gap-3 rounded-md border border-border border-l-4 bg-background p-3"
      style={borderStyle}
    >
      <form method="post" action={completeAction} className="pt-0.5">
        <input type="hidden" name="_redirect" value={props.redirectBack} />
        <button
          type="submit"
          aria-label={props.status === 'done' ? 'Mark open' : 'Mark done'}
          className={`flex h-5 w-5 items-center justify-center rounded border ${
            props.status === 'done'
              ? 'border-green-600 bg-green-600 text-white'
              : props.status === 'skipped'
                ? 'border-border bg-muted text-muted-foreground'
                : 'border-border hover:border-primary'
          }`}
        >
          {props.status === 'done' ? '✓' : props.status === 'skipped' ? '–' : ''}
        </button>
      </form>

      <div className="min-w-0 flex-1 space-y-1">
        <HeaderLine
          priorityName={props.priorityName}
          priorityColor={props.priorityColor}
          priorityPaused={props.priorityPaused}
          timeRange={props.timeRange}
        />
        <h4
          className={`truncate text-sm font-medium ${
            props.status === 'done' ? 'text-muted-foreground line-through' : ''
          }`}
        >
          {props.title}
        </h4>
        {props.recurrenceLabel ? (
          <p className="text-xs text-muted-foreground">↻ {props.recurrenceLabel}</p>
        ) : null}
        {props.description ? (
          <p className="whitespace-pre-wrap text-xs text-foreground/80">{props.description}</p>
        ) : null}
        <div className="flex items-center gap-3 pt-1">
          {!props.isVirtual ? (
            <>
              <Link
                href={`/priorities/${props.ownerPriorityId}/tasks/${props.id}/edit`}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Edit
              </Link>
              <span className="text-xs text-muted-foreground">·</span>
              <form
                method="post"
                action={taskAction}
                onSubmit={(e) => {
                  if (!window.confirm('Delete this task?')) e.preventDefault();
                }}
              >
                <input type="hidden" name="_action" value="delete" />
                <input type="hidden" name="_redirect" value={props.redirectBack} />
                <button type="submit" className="text-xs text-red-700 hover:underline">
                  Delete
                </button>
              </form>
            </>
          ) : (
            <span className="text-[11px] italic text-muted-foreground">
              From recurring template — tap to materialize today's instance.
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function FeedEventBody(props: DailyFeedEventRowProps) {
  return (
    <article className="space-y-1 rounded-md border border-border border-l-4 border-l-muted-foreground/40 bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-full border border-border bg-muted px-2 py-0.5 uppercase tracking-wide">
          Calendar
        </span>
        <span>· {props.timeRange}</span>
        {props.isRemoved ? (
          <span className="text-amber-700">· removed from source</span>
        ) : null}
      </div>
      <h4
        className={`truncate text-sm font-medium ${
          props.isRemoved ? 'italic text-muted-foreground' : ''
        }`}
      >
        {props.title}
      </h4>
      <p className="text-xs text-muted-foreground">From: {props.sourceName}</p>
      {props.description ? (
        <p className="whitespace-pre-wrap text-xs text-foreground/80">{props.description}</p>
      ) : null}
    </article>
  );
}

function EventBody(props: DailyEventRowProps) {
  const eventAction = `/api/events/${props.id}`;
  const current = props.completionStatus ?? 'none';
  const borderStyle = { borderLeftColor: props.priorityColor };

  return (
    <article
      className="space-y-2 rounded-md border border-border border-l-4 bg-background p-3"
      style={borderStyle}
    >
      <HeaderLine
        priorityName={props.priorityName}
        priorityColor={props.priorityColor}
        priorityPaused={props.priorityPaused}
        timeRange={props.timeRange}
      />
      <h4 className="truncate text-sm font-medium">{props.title}</h4>
      {props.recurrenceLabel ? (
        <p className="text-xs text-muted-foreground">↻ {props.recurrenceLabel}</p>
      ) : null}
      {props.description ? (
        <p className="whitespace-pre-wrap text-xs text-foreground/80">{props.description}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1 pt-1">
        {EVENT_STATUS_OPTIONS.map((opt) => (
          <form key={opt.value} method="post" action={eventAction}>
            <input type="hidden" name="_redirect" value={props.redirectBack} />
            <input
              type="hidden"
              name="completionStatus"
              value={opt.value === 'none' ? '' : opt.value}
            />
            <button
              type="submit"
              className={`rounded-md border px-2 py-1 text-xs ${
                current === opt.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border hover:bg-muted'
              }`}
              aria-pressed={current === opt.value}
            >
              {opt.label}
            </button>
          </form>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-1">
        {!props.isVirtual ? (
          <>
            <Link
              href={`/priorities/${props.ownerPriorityId}/events/${props.id}/edit`}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Edit
            </Link>
            <span className="text-xs text-muted-foreground">·</span>
            <form
              method="post"
              action={eventAction}
              onSubmit={(e) => {
                if (!window.confirm('Delete this event?')) e.preventDefault();
              }}
            >
              <input type="hidden" name="_action" value="delete" />
              <input type="hidden" name="_redirect" value={props.redirectBack} />
              <button type="submit" className="text-xs text-red-700 hover:underline">
                Delete
              </button>
            </form>
          </>
        ) : (
          <span className="text-[11px] italic text-muted-foreground">
            From recurring template — pick a status to materialize this instance.
          </span>
        )}
      </div>
    </article>
  );
}
