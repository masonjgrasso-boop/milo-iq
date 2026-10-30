// Sign-in providers. Google is always available; Apple and Microsoft are
// gated behind env flags because each needs extra setup outside this repo
// (Apple needs a paid developer account, Microsoft needs an Azure app).

import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signOut,
  type AuthProvider,
  type UserCredential,
} from 'firebase/auth';
import { getFirebaseAuth } from './firebase';

export type ProviderId = 'google' | 'apple' | 'microsoft';

const flag = (value: string | undefined): boolean => value === 'true';

export const enabledProviders: ProviderId[] = [
  'google',
  ...(flag(import.meta.env.VITE_ENABLE_APPLE) ? (['apple'] as const) : []),
  ...(flag(import.meta.env.VITE_ENABLE_MICROSOFT) ? (['microsoft'] as const) : []),
];

export const providerLabels: Record<ProviderId, string> = {
  google: 'Google',
  apple: 'Apple',
  microsoft: 'Microsoft',
};

function buildProvider(id: ProviderId): AuthProvider {
  switch (id) {
    case 'google':
      return new GoogleAuthProvider();
    case 'apple': {
      const provider = new OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');
      return provider;
    }
    case 'microsoft':
      return new OAuthProvider('microsoft.com');
  }
}

export function signInWith(id: ProviderId): Promise<UserCredential> {
  return signInWithPopup(getFirebaseAuth(), buildProvider(id));
}

export function signOutUser(): Promise<void> {
  return signOut(getFirebaseAuth());
}
