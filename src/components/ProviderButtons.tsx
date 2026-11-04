// The sign-in buttons.
//
// Shared by the sign-in screen and the landing page's closing call to action,
// so there is one place that knows how a provider failure is reported.

import { useState } from 'react';
import { enabledProviders, providerLabels, signInWith, type ProviderId } from '../lib/auth';
import { Button } from './ui';

export function ProviderButtons({ onHero = false }: {
  /** True when these sit on a dark card, where the roles invert. */
  onHero?: boolean;
}) {
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
    <div className="flex flex-col gap-2.5">
      {enabledProviders.map((id) => {
        const primary = id === 'google';
        return (
          <Button
            key={id}
            size="lg"
            variant={onHero ? 'onHero' : primary ? 'primary' : 'secondary'}
            disabled={busy !== null}
            onClick={() => handleSignIn(id)}
            className="gap-3"
          >
            <span
              aria-hidden="true"
              className={`flex h-6 w-6 items-center justify-center rounded-full text-sm font-black
                ${onHero || !primary ? 'bg-brand-wash text-brand' : 'bg-white text-brand'}`}
            >
              {providerLabels[id].charAt(0)}
            </span>
            {busy === id ? 'Opening…' : `Continue with ${providerLabels[id]}`}
          </Button>
        );
      })}

      {error && (
        <p
          role="alert"
          className={`text-center text-sm font-semibold ${onHero ? 'text-white' : 'text-danger'}`}
        >
          {error}
        </p>
      )}
    </div>
  );
}
