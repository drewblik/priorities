import { requireUser } from '@/auth';
import { getSettingsView } from '@/lib/settings';

type SearchParams = { [key: string]: string | string[] | undefined };

const ERROR_COPY: Record<string, string> = {
  validation_failed: "Some fields weren't valid. Check the values and try again.",
  save_failed: "We couldn't save your changes. Try again in a moment.",
};

export default async function ProfileSettingsPage({
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

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your account email and display preferences.
        </p>
      </div>

      <form method="post" action="/api/settings" className="space-y-4">
        <input type="hidden" name="_redirect" value="/settings/profile" />

        <Field label="Email" hint="Sign-in identity. Not editable in v1.">
          <input
            type="email"
            value={view?.email ?? session.user.email}
            disabled
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-base text-muted-foreground"
          />
        </Field>

        <Field label="Name" hint="Optional display name.">
          <input
            type="text"
            name="name"
            defaultValue={view?.name ?? ''}
            maxLength={120}
            placeholder="e.g. Drew"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
          />
        </Field>

        <Field
          label="Timezone"
          hint="IANA timezone string (e.g. America/Los_Angeles, Europe/Berlin). Used to render dates."
        >
          <input
            type="text"
            name="timezone"
            defaultValue={view?.timezone ?? 'America/Los_Angeles'}
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
          />
        </Field>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Save changes
          </button>
          {saved ? <p className="text-sm text-green-600">Saved.</p> : null}
          {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
        </div>
      </form>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
