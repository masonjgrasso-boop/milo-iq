import { createContext, useContext } from 'react';
import type { User } from 'firebase/auth';
import type { UserProfile } from '../lib/types';

export interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  /** True until we know both who the user is and whether they have a profile. */
  loading: boolean;
  /** Called after onboarding so the rest of the app sees the new profile. */
  setProfile: (profile: UserProfile) => void;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
