import type { Priority } from '@/db/schema';

type Props = {
  firstPriority: Priority | null;
};

export function ChatPlaceholder({ firstPriority }: Props) {
  return (
    <details open className="rounded-md border border-border bg-background p-4">
      <summary className="cursor-pointer select-none text-base font-medium">
        Chat
      </summary>

      <div className="mt-3 space-y-3">
        {firstPriority ? (
          <div className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: firstPriority.icon.color }}
            />
            <span className="font-medium">{firstPriority.name}</span>
            <span className="text-muted-foreground">would chat first.</span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No Priority selected.</p>
        )}

        <textarea
          disabled
          rows={3}
          placeholder="Chatbot streams here in M12."
          className="w-full cursor-not-allowed rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground placeholder:text-muted-foreground/70"
          aria-label="Chat placeholder textarea"
        />

        <button
          type="button"
          disabled
          className="cursor-not-allowed rounded-md border border-dashed border-border bg-muted/30 px-4 py-2 text-sm text-muted-foreground"
          aria-disabled="true"
        >
          Start chat
        </button>

        <p className="text-xs text-muted-foreground">
          The Quarter Planning chatbot lands in M12. For now this block stakes
          out where streaming responses + tool-call confirmations will render.
        </p>
      </div>
    </details>
  );
}
