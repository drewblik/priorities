import { requireUser } from '@/auth';
import { getSettingsView } from '@/lib/settings';

type SearchParams = { [key: string]: string | string[] | undefined };

const ERROR_COPY: Record<string, string> = {
  validation_failed: 'That key did not look valid. Paste the full key and try again.',
  save_failed: "We couldn't save your key. Try again in a moment.",
};

export default async function ApiKeySettingsPage({
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
  const hasKey = view?.hasApiKey ?? false;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Anthropic API Key</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your personal Anthropic API key. Used for every chatbot call you trigger. Encrypted at
          rest with AES-256-GCM and only decrypted when constructing the SDK client.
        </p>
      </div>

      <div
        className={`rounded-md border px-3 py-2 text-sm ${
          hasKey
            ? 'border-green-600/30 bg-green-600/5 text-green-700'
            : 'border-border bg-muted text-muted-foreground'
        }`}
        role="status"
      >
        {hasKey ? 'Key saved ✓' : 'No key set yet.'}
      </div>

      <form method="post" action="/api/settings" className="space-y-3">
        <input type="hidden" name="_redirect" value="/settings/api-key" />
        <label className="block space-y-1">
          <span className="text-sm font-medium">
            {hasKey ? 'Replace key' : 'Paste your key'}
          </span>
          <input
            type="password"
            name="anthropicApiKey"
            required
            minLength={1}
            maxLength={500}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="sk-ant-..."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
          />
          <span className="block text-xs text-muted-foreground">
            Get one at console.anthropic.com. We don&apos;t validate it until your first AI call.
          </span>
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {hasKey ? 'Replace key' : 'Save key'}
          </button>
          {saved ? <p className="text-sm text-green-600">Saved.</p> : null}
          {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
        </div>
      </form>

      {hasKey ? (
        <form method="post" action="/api/settings">
          <input type="hidden" name="_redirect" value="/settings/api-key" />
          <input type="hidden" name="_action" value="clear-api-key" />
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            Clear key
          </button>
        </form>
      ) : null}
    </section>
  );
}
