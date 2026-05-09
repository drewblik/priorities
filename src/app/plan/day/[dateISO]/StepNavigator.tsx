import Link from 'next/link';

type Step = 1 | 2 | 3;

type Props = {
  dateISO: string;
  currentStep: Step;
};

const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: '1. Progress' },
  { step: 2, label: '2. Capture' },
  { step: 3, label: '3. Plan tomorrow' },
];

export function StepNavigator({ dateISO, currentStep }: Props) {
  return (
    <nav
      className="flex flex-wrap gap-1 border-b border-border"
      aria-label="Evening review steps"
    >
      {STEPS.map(({ step, label }) => {
        const active = step === currentStep;
        const className = `rounded-t-md px-3 py-2 text-sm ${
          active
            ? 'border-b-2 border-primary font-medium text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`;
        return (
          <Link
            key={step}
            href={`/plan/day/${dateISO}?step=${step}`}
            className={className}
            aria-current={active ? 'page' : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
