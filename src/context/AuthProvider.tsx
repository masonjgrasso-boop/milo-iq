import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getFirebaseAuth } from '../lib/firebase';
import { loadProfile } from '../lib/profile';
import type { UserProfile } from '../lib/types';
import { AuthContext } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(getFirebaseAuth(), async (nextUser) => {
      setUser(nextUser);
      // Fetch the profile before clearing the loading flag, so routing never
      // flashes the onboarding screen at someone who already finished it.
      setProfile(nextUser ? await loadProfile(nextUser.uid) : null);
      setLoading(false);
    });
  }, []);

  const value = useMemo(
    () => ({ user, profile, loading, setProfile }),
    [user, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
