// Shown when the Firebase env vars are missing, so a fresh clone explains
// itself instead of crashing.

export function SetupNotice() {
  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <h1 className="text-2xl font-bold text-slate-900">Almost there</h1>
      <p className="mt-3 text-slate-600">
        Milo IQ needs a Firebase project before it can run.
      </p>
      <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm text-slate-600">
        <li>
          Copy <code className="rounded bg-slate-100 px-1 py-0.5">.env.example</code> to{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5">.env.local</code>
        </li>
        <li>Paste in your Firebase config values</li>
        <li>Restart the dev server</li>
      </ol>
      <p className="mt-5 text-sm text-slate-500">
        The README walks through creating the project step by step.
      </p>
    </div>
  );
}
