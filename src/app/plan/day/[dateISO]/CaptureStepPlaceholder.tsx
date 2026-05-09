import Link from 'next/link';

type Props = {
  dateISO: string;
};

export function CaptureStepPlaceholder({ dateISO }: Props) {
  return (
    <section className="rounded-md border border-dashed border-border bg-muted/40 p-4">
      <h2 className="text-base font-medium">Step 2 — Capture</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        &ldquo;Anything new to capture before planning tomorrow?&rdquo; This step
        is the Master Chat surface that routes captures to the right Priority
        — it lands with M16. Until then, jump to Step 3 and the Daily Plan
        chatbot will time-block tomorrow.
      </p>
      <div className="mt-3">
        <Link
          href={`/plan/day/${dateISO}?step=3`}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Continue →
        </Link>
      </div>
    </section>
  );
}
