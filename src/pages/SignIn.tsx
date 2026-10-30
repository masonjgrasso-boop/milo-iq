import { useState } from 'react';
import { enabledProviders, providerLabels, signInWith, type ProviderId } from '../lib/auth';
import { Button } from '../components/ui';

export function SignIn() {
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn(id: ProviderId) {
    setBusy(id);
    setError(null);
    try {
      await signInWith(id);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      // Closing the popup is a normal thing to do, not an error worth shouting about.
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError('That sign-in did not go through. Please try again.');
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="text-center">
        <img src="/icon-192.png" alt="" className="mx-auto h-16 w-16 rounded-2xl" />
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-900">Milo IQ</h1>
        <p className="mt-2 text-slate-600">
          Fitness tracking that forgives the days you miss.
        </p>
      </div>

      <div className="mt-10 space-y-3">
        {enabledProviders.map((id) => (
          <Button
            key={id}
            variant={id === 'google' ? 'primary' : 'secondary'}
            disabled={busy !== null}
            onClick={() => handleSignIn(id)}
          >
            {busy === id ? 'Opening…' : `Continue with ${providerLabels[id]}`}
          </Button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-center text-sm text-red-600">
          {error}
        </p>
      )}

      <p className="mt-10 text-center text-xs text-slate-400">
        Your data stays in your own Firebase project.
      </p>
    </div>
  );
}
