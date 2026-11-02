// Maintenance calories, in the middle of Trends.
//
// One number and one sentence. Before there is enough history the number is
// the formula estimate, labelled as one with a countdown, because showing
// nothing is worse than showing an honest approximation.

import type { MaintenanceResult } from '../lib/maintenance';
import type { MaintenanceBasis } from '../lib/pace';
import { suggestedTarget } from '../lib/targets';
import type { UserProfile } from '../lib/types';
import { UpdateTargetButton } from './UpdateTargetButton';
import { Card } from './ui';

/** Why this is still an estimate, in a few words. */
function estimateNote(result: Extract<MaintenanceResult, { status: 'not-ready' }>): string {
  if (result.reason === 'needs-days') {
    const n = result.daysStillNeeded;
    return `estimate, ${n} more ${n === 1 ? 'day' : 'days'} to go`;
  }
  if (result.reason === 'needs-weigh-ins') return 'estimate, a few more weigh-ins to go';
  return 'estimate, keep weighing in for another week or two';
}

export function MaintenanceBox({ result, basis, profile }: {
  result: MaintenanceResult;
  basis: MaintenanceBasis;
  profile: UserProfile;
}) {
  const suggested =
    result.status === 'ready' ? suggestedTarget(result.maintenanceCalories, profile) : null;
  // Not worth offering a change the user would not notice.
  const differs = suggested !== null && Math.abs(suggested - profile.calorieTarget) >= 50;

  return (
    <Card>
      <h3 className="text-sm font-semibold text-slate-900">Maintenance calories</h3>

      <p className="mt-1 text-4xl font-bold text-slate-900">
        {basis.calories.toLocaleString()}{' '}
        <span className="text-lg font-semibold text-slate-500">cal/day</span>
      </p>

      <p className="mt-2 text-sm text-slate-600">
        Calculated from your logged calories and weight trend.
        {result.status === 'not-ready' && ` (${estimateNote(result)})`}
      </p>

      {differs && (
        <div className="mt-4 rounded-xl bg-brand-50 p-3">
          <p className="text-sm text-brand-700">
            A target of <strong>{suggested.toLocaleString()} cal</strong> fits your goal
            better than your current {profile.calorieTarget.toLocaleString()}.
          </p>
          <div className="mt-3">
            <UpdateTargetButton suggested={suggested} />
          </div>
        </div>
      )}
    </Card>
  );
}
