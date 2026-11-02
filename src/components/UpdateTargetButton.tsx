// Resetting the daily target around a measured maintenance figure.
//
// Shared by the Trends box and the Maintenance page so the two can never drift
// apart on what they save.

import { useState } from 'react';
import { useAuth } from '../context/auth-context';
import { saveProfile } from '../lib/profile';
import { Button } from './ui';

export function UpdateTargetButton({ suggested }: { suggested: number }) {
  const { user, profile, setProfile } = useAuth();
  const [saving, setSaving] = useState(false);

  async function apply() {
    if (!user || !profile) return;
    setSaving(true);
    const next = { ...profile, calorieTarget: suggested };
    await saveProfile(user.uid, next);
    setProfile(next);
    setSaving(false);
  }

  return (
    <Button onClick={apply} disabled={saving}>
      {saving ? 'Updating…' : 'Update my target'}
    </Button>
  );
}
