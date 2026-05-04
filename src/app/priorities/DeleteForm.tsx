'use client';

type Props = {
  action: string;
  confirmMessage?: string;
};

export function DeleteForm({
  action,
  confirmMessage = 'Delete this Priority? This is recoverable via SQL until M19.',
}: Props) {
  return (
    <form
      method="post"
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="_action" value="delete" />
      <button
        type="submit"
        className="rounded-md border border-red-600/40 bg-red-600/5 px-3 py-2 text-sm text-red-700 hover:bg-red-600/10"
      >
        Delete Priority
      </button>
    </form>
  );
}
