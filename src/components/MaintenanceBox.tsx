// Maintenance calories, as one short strip at the top of Trends.
//
// Everything below it is measured against this number, so it leads — but it is
// a reference figure, not the story, so it stays to a title row, a line of
// explanation, and nothing else. Before there is enough history the number is
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
    <Card className="px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Maintenance calories
        </h3>
        <p className="shrink-0 text-2xl leading-none font-bold text-slate-900">
          {basis.calories.toLocaleString()}{' '}
          <span className="text-xs font-semibold text-slate-500">cal/day</span>
        </p>
      </div>

      <p className="mt-1.5 text-xs leading-snug text-slate-500">
        Calculated from your logged calories and weight trend.
        {result.status === 'not-ready' && ` (${estimateNote(result)})`}
      </p>

      {differs && (
        <div className="mt-2.5">
          <UpdateTargetButton suggested={suggested} compact />
        </div>
      )}
    </Card>
  );
}
