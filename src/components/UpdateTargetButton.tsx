// Resetting the daily target around a measured maintenance figure.
//
// Shared by the Trends box and the Maintenance page so the two can never drift
// apart on what they save.

import { useState } from 'react';
import { useAuth } from '../context/auth-context';
import { saveProfile } from '../lib/profile';
import { Button } from './ui';

export function UpdateTargetButton({ suggested, compact = false }: {
  suggested: number;
  /** A pill that names the new figure, for places that cannot spare the room. */
  compact?: boolean;
}) {
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

  if (compact) {
    return (
      <button
        type="button"
        onClick={apply}
        disabled={saving}
        className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-xs
          font-semibold text-brand-700 transition hover:bg-brand-100
          disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? 'Updating…' : `Update my target to ${suggested.toLocaleString()}`}
      </button>
    );
  }

  return (
    <Button onClick={apply} disabled={saving}>
      {saving ? 'Updating…' : 'Update my target'}
    </Button>
  );
}
