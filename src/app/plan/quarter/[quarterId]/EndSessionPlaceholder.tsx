export function EndSessionPlaceholder() {
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-border bg-background p-4">
      <button
        type="button"
        disabled
        className="cursor-not-allowed rounded-md border border-dashed border-border bg-muted/30 px-4 py-2 text-sm text-muted-foreground"
        aria-disabled="true"
      >
        End session
      </button>
      <p className="text-xs text-muted-foreground">
        Wires up in M12 alongside the chatbot. Closing a session will save
        progress and return you to the Council.
      </p>
    </div>
  );
}
