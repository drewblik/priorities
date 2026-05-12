'use client';

import type { MasterChatResponse, ProposedAction } from '@/lib/master-chat-tools';

type Props = {
  preview: MasterChatResponse;
  /** Map of priority id → { name, color } used to render the affected_priorities
   *  chips with their actual color. */
  priorityById: Map<string, { name: string; color: string }>;
  onCancel: () => void;
  /** Real Confirm handler (M17). Posts the preview back to the server,
   *  which validates + executes the proposed actions atomically. */
  onConfirm: () => void;
  /** Disables Confirm while the parent's POST is in flight. */
  busy?: boolean;
};

export function PreviewCard({ preview, priorityById, onCancel, onConfirm, busy = false }: Props) {
  return (
    <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-4">
      <div>
        <p className="text-sm font-medium">{preview.preview_summary}</p>
        {preview.understanding ? (
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="uppercase tracking-wide">Understood as:</span>{' '}
            {preview.understanding}
          </p>
        ) : null}
      </div>

      {preview.affected_priorities.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {preview.affected_priorities.map((ap) => {
            const meta = priorityById.get(ap.id);
            const color = meta?.color ?? '#9ca3af';
            const name = meta?.name ?? ap.id;
            return (
              <span
                key={ap.id}
                title={ap.reasoning}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px]"
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 flex-none rounded-full"
                  style={{ backgroundColor: color }}
                />
                {name}
              </span>
            );
          })}
        </div>
      ) : null}

      {preview.proposed_actions.length > 0 ? (
        <ul className="space-y-2">
          {preview.proposed_actions.map((a, i) => (
            <li
              key={i}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <ActionRow action={a} priorityById={priorityById} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          No concrete actions proposed.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || preview.proposed_actions.length === 0}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Confirm'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ActionRow({
  action,
  priorityById,
}: {
  action: ProposedAction;
  priorityById: Map<string, { name: string; color: string }>;
}) {
  const badge = (
    <span className="mr-2 inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
      {action.type.replace(/_/g, ' ')}
    </span>
  );

  const priorityDot = (priorityId: string) => {
    const meta = priorityById.get(priorityId);
    if (!meta) return null;
    return (
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className="h-2 w-2 flex-none rounded-full"
          style={{ backgroundColor: meta.color }}
        />
        <span className="text-xs font-medium">{meta.name}</span>
      </span>
    );
  };

  if (action.type === 'add_priority_memory') {
    return (
      <div>
        {badge}
        {priorityDot(action.priority_id)}
        <p className="mt-1 whitespace-pre-wrap text-sm">{action.body}</p>
        {action.tags && action.tags.length > 0 ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            tags: {action.tags.join(', ')}
          </p>
        ) : null}
      </div>
    );
  }

  if (action.type === 'create_task') {
    return (
      <div>
        {badge}
        {priorityDot(action.owner_priority_id)}
        <p className="mt-1 text-sm font-medium">{action.title}</p>
        <p className="text-[11px] text-muted-foreground">
          {action.target_date ? `date: ${action.target_date}` : 'no date'}
          {action.time_block_start && action.time_block_end
            ? ` · time: ${action.time_block_start} → ${action.time_block_end}`
            : ''}
        </p>
        {action.description ? (
          <p className="mt-1 text-xs text-muted-foreground">{action.description}</p>
        ) : null}
      </div>
    );
  }

  if (action.type === 'modify_task') {
    return (
      <div>
        {badge}
        <p className="mt-1 text-sm">
          Task <span className="font-mono text-xs">{action.task_id}</span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          changes: {Object.keys(action.changes).join(', ') || '(none)'}
        </p>
      </div>
    );
  }

  if (action.type === 'complete_task') {
    return (
      <div>
        {badge}
        <p className="mt-1 text-sm">
          Mark task <span className="font-mono text-xs">{action.task_id}</span> complete.
        </p>
      </div>
    );
  }

  if (action.type === 'create_event') {
    return (
      <div>
        {badge}
        {priorityDot(action.owner_priority_id)}
        <p className="mt-1 text-sm font-medium">{action.title}</p>
        <p className="text-[11px] text-muted-foreground">
          {action.start_time} → {action.end_time}
        </p>
        {action.description ? (
          <p className="mt-1 text-xs text-muted-foreground">{action.description}</p>
        ) : null}
      </div>
    );
  }

  if (action.type === 'modify_event') {
    return (
      <div>
        {badge}
        <p className="mt-1 text-sm">
          Event <span className="font-mono text-xs">{action.event_id}</span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          changes: {Object.keys(action.changes).join(', ') || '(none)'}
        </p>
      </div>
    );
  }

  if (action.type === 'reschedule_quarter_week_focus') {
    return (
      <div>
        {badge}
        {priorityDot(action.priority_id)}
        <p className="mt-1 text-sm">
          Week {action.week_number}: <span className="font-medium">{action.new_focus_label}</span>
        </p>
      </div>
    );
  }

  if (action.type === 'update_priority_field') {
    return (
      <div>
        {badge}
        {priorityDot(action.priority_id)}
        <p className="mt-1 text-sm">
          Field <span className="font-mono text-xs">{action.field}</span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          new value: {JSON.stringify(action.value)}
        </p>
      </div>
    );
  }

  // Exhaustive — should never reach.
  return <div className="text-xs text-muted-foreground">unknown action</div>;
}
