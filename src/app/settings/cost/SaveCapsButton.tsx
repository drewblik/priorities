'use client';

/** Submit button with a lightweight confirm. The form is a plain HTML
 *  POST to /api/settings; this only adds a guard so a cap change isn't
 *  accidental. Server still validates. */
export function SaveCapsButton() {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!window.confirm('Update your cost caps?')) e.preventDefault();
      }}
      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
    >
      Save caps
    </button>
  );
}
