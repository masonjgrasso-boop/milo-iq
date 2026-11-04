// Shown when the Firebase env vars are missing, so a fresh clone explains
// itself instead of crashing.

export function SetupNotice() {
  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <h1 className="text-2xl font-bold text-ink">Almost there</h1>
      <p className="mt-3 text-ink-soft">
        Milo IQ needs a Firebase project before it can run.
      </p>
      <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm text-ink-soft">
        <li>
          Copy <code className="rounded bg-muted px-1 py-0.5">.env.example</code> to{' '}
          <code className="rounded bg-muted px-1 py-0.5">.env.local</code>
        </li>
        <li>Paste in your Firebase config values</li>
        <li>Restart the dev server</li>
      </ol>
      <p className="mt-5 text-sm text-ink-mute">
        The README walks through creating the project step by step.
      </p>
    </div>
  );
}
