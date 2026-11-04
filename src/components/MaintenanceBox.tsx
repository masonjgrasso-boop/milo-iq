// Maintenance calories, as the hero at the top of Trends.
//
// Everything below it is measured against this number, so it leads and it is
// the one figure on the screen given the dark card. Before there is enough
// history the number is the formula estimate, labelled as one with a
// countdown, because showing nothing is worse than showing an honest
// approximation.

import type { MaintenanceResult } from '../lib/maintenance';
import type { MaintenanceBasis } from '../lib/pace';
import { suggestedTarget } from '../lib/targets';
import type { UserProfile } from '../lib/types';
import { UpdateTargetButton } from './UpdateTargetButton';
import { Eyebrow, HeroCard } from './ui';

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
    <HeroCard className="flex flex-col gap-1.5">
      <Eyebrow className="text-[10px] text-brand-pale">
        {result.status === 'ready' ? 'Your real maintenance' : 'Starting estimate'}
      </Eyebrow>

      <p className="flex items-baseline gap-2">
        <span className="display tnum text-[46px]">{basis.calories.toLocaleString()}</span>
        <span className="text-sm opacity-80">cal / day</span>
      </p>

      <p className="text-[13px] opacity-85">
        Calculated from your logged calories and weight trend.
        {result.status === 'not-ready' && ` (${estimateNote(result)})`}
      </p>

      {differs && (
        <div className="mt-1.5">
          <UpdateTargetButton suggested={suggested} compact />
        </div>
      )}
    </HeroCard>
  );
}
