// The adaptive maintenance estimate.
//
// Before there is enough data this card says so plainly and counts down,
// rather than showing a confident-looking number built on three days of logs.

import { useAuth } from '../context/auth-context';
import { CONFIDENCE_LABELS, MIN_DAYS, type MaintenanceResult } from '../lib/maintenance';
import { maintenanceBasis } from '../lib/pace';
import { suggestedTarget } from '../lib/targets';
import { UpdateTargetButton } from './UpdateTargetButton';
import { Card } from './ui';

// Stated the same way whether or not there is a number to show yet.
const BLURB =
  'Milo IQ compares your actual intake and weight trend to accurately calculate your ' +
  'maintenance calories. No guesswork. The more you log over time, the more accurate it gets.';

const CONFIDENCE_STYLES = {
  low: 'bg-muted text-ink-soft',
  medium: 'bg-cream text-over',
  high: 'bg-brand-pill text-brand',
} as const;

export function MaintenanceCard({ result, latestWeightKg }: {
  result: MaintenanceResult;
  /** Current trend weight, so the starting estimate does not go stale. */
  latestWeightKg?: number;
}) {
  const { profile } = useAuth();

  if (!profile) return null;

  if (result.status === 'not-ready') {
    const message =
      result.reason === 'needs-days'
        ? `${result.daysStillNeeded} more ${result.daysStillNeeded === 1 ? 'day' : 'days'} of food logs to go.`
        : result.reason === 'needs-weigh-ins'
          ? 'Step on the scale a few more times and this will appear.'
          : 'Keep weighing in over the next week or two so the trend can settle.';

    const progress = Math.min(100, Math.round((result.daysLogged / MIN_DAYS) * 100));
    // Until there is a measurement, show the onboarding estimate rather than
    // nothing — labelled, so it is never mistaken for the real figure.
    const estimate = maintenanceBasis(result, profile, latestWeightKg).calories;

    return (
      <Card>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">Your real maintenance</h3>
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-ink-soft">
            Starting estimate
          </span>
        </div>

        <p className="mt-2 text-4xl font-bold text-ink">
          {estimate.toLocaleString()}{' '}
          <span className="text-lg font-semibold text-ink-mute">cal/day</span>
        </p>

        <p className="mt-2 text-sm text-ink-soft">{BLURB}</p>
        <p className="mt-2 text-sm font-medium text-ink-soft">
          This is the formula estimate from your height, weight, age and activity. {message}
        </p>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-brand-mid" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-xs text-ink-mute">
          {result.daysLogged} of {MIN_DAYS} days logged &middot; {result.weighIns} weigh-ins
        </p>
      </Card>
    );
  }

  // Keep the goal the user chose, just anchored to the measured number.
  const suggested = suggestedTarget(result.maintenanceCalories, profile);
  const differs = Math.abs(suggested - profile.calorieTarget) >= 50;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">Your real maintenance</h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            CONFIDENCE_STYLES[result.confidence]
          }`}
        >
          {CONFIDENCE_LABELS[result.confidence]}
        </span>
      </div>

      <p className="mt-2 text-4xl font-bold text-ink">
        {result.maintenanceCalories.toLocaleString()}{' '}
        <span className="text-lg font-semibold text-ink-mute">cal/day</span>
      </p>

      <p className="mt-2 text-sm text-ink-soft">{BLURB}</p>

      <p className="mt-1.5 text-xs text-ink-mute">
        Measured from {result.daysLogged} days of logs and {result.weighIns} weigh-ins.
      </p>

      {differs && (
        <div className="mt-4 rounded-xl bg-brand-wash p-3">
          <p className="text-sm text-brand">
            Based on this, a target of <strong>{suggested.toLocaleString()} cal</strong> fits
            your goal better than your current {profile.calorieTarget.toLocaleString()}.
          </p>
          <div className="mt-3">
            <UpdateTargetButton suggested={suggested} />
          </div>
        </div>
      )}
    </Card>
  );
}
