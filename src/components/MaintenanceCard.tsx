// The adaptive maintenance estimate.
//
// Before there is enough data this card says so plainly and counts down,
// rather than showing a confident-looking number built on three days of logs.

import { useState } from 'react';
import { useAuth } from '../context/auth-context';
import { saveProfile } from '../lib/profile';
import { CONFIDENCE_LABELS, MIN_DAYS, type MaintenanceResult } from '../lib/maintenance';
import { dailyCalorieDelta, SAFE_MIN_CALORIES } from '../lib/targets';
import { Button, Card } from './ui';

// Stated the same way whether or not there is a number to show yet.
const BLURB =
  'Milo IQ compares your actual intake and weight trend to accurately calculate your ' +
  'maintenance calories. No guesswork. The more you log over time, the more accurate it gets.';

const CONFIDENCE_STYLES = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-brand-100 text-brand-700',
} as const;

export function MaintenanceCard({ result }: { result: MaintenanceResult }) {
  const { user, profile, setProfile } = useAuth();
  const [saving, setSaving] = useState(false);

  if (!profile) return null;

  if (result.status === 'not-ready') {
    const message =
      result.reason === 'needs-days'
        ? `${result.daysStillNeeded} more ${result.daysStillNeeded === 1 ? 'day' : 'days'} of food logs to go.`
        : result.reason === 'needs-weigh-ins'
          ? 'Step on the scale a few more times and this will appear.'
          : 'Keep weighing in over the next week or two so the trend can settle.';

    const progress = Math.min(100, Math.round((result.daysLogged / MIN_DAYS) * 100));

    return (
      <Card>
        <h3 className="text-sm font-semibold text-slate-900">Your real maintenance</h3>
        <p className="mt-2 text-sm text-slate-600">{BLURB}</p>
        <p className="mt-2 text-sm font-medium text-slate-700">{message}</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {result.daysLogged} of {MIN_DAYS} days logged &middot; {result.weighIns} weigh-ins
        </p>
      </Card>
    );
  }

  // Keep the goal the user chose, just anchored to the measured number.
  const delta = profile.goal === 'maintain' ? 0 : dailyCalorieDelta(profile.targetRateKgPerWeek);
  const direction = profile.goal === 'gain' ? 1 : -1;
  const suggested = Math.max(
    SAFE_MIN_CALORIES[profile.sex],
    Math.round(result.maintenanceCalories + direction * delta),
  );
  const differs = Math.abs(suggested - profile.calorieTarget) >= 50;

  async function applySuggestion() {
    if (!user || !profile) return;
    setSaving(true);
    const next = { ...profile, calorieTarget: suggested };
    await saveProfile(user.uid, next);
    setProfile(next);
    setSaving(false);
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">Your real maintenance</h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            CONFIDENCE_STYLES[result.confidence]
          }`}
        >
          {CONFIDENCE_LABELS[result.confidence]}
        </span>
      </div>

      <p className="mt-2 text-4xl font-bold text-slate-900">
        {result.maintenanceCalories.toLocaleString()}{' '}
        <span className="text-lg font-semibold text-slate-500">cal/day</span>
      </p>

      <p className="mt-2 text-sm text-slate-600">{BLURB}</p>

      <p className="mt-1.5 text-xs text-slate-500">
        Measured from {result.daysLogged} days of logs and {result.weighIns} weigh-ins.
      </p>

      {differs && (
        <div className="mt-4 rounded-xl bg-brand-50 p-3">
          <p className="text-sm text-brand-700">
            Based on this, a target of <strong>{suggested.toLocaleString()} cal</strong> fits
            your goal better than your current {profile.calorieTarget.toLocaleString()}.
          </p>
          <div className="mt-3">
            <Button onClick={applySuggestion} disabled={saving}>
              {saving ? 'Updating…' : 'Use this target'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
