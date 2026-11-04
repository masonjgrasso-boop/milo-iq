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
        className="self-start rounded-chip bg-white/15 px-3 py-2 text-xs font-bold
          text-white ring-1 ring-white/25 transition hover:bg-white/25
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
