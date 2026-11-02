// The three numbers Trends exists to show, and what to do about them.
//
// "Status" is a verdict rather than a figure, so it gets the third tile and a
// sentence of its own underneath — a recovery instruction crammed into a stat
// tile is unreadable on a phone.

import { planRecovery, RECOVERY_DAYS, type CatchUpPlan } from '../lib/catchup';
import { RANGE_LABELS, type TrendRange } from '../lib/deficit';
import type { PaceSummary } from '../lib/pace';
import { SAFE_MIN_CALORIES } from '../lib/targets';
import type { Sex } from '../lib/types';
import { Card, Stat } from './ui';

const cal = (value: number): string => Math.abs(Math.round(value)).toLocaleString();

/** A number above maintenance is shown with a plus, as elsewhere in the app. */
const signed = (value: number): string => `${value >= 0 ? '' : '+'}${cal(value)}`;

function verdict(
  pace: PaceSummary,
  plan: CatchUpPlan,
  safeMinimum: number,
  target: number,
): string {
  if (!plan.needed) {
    return pace.goal === 'maintain'
      ? 'You are sitting where you meant to. Nothing to change.'
      : 'Your average is meeting the deficit your goal asks for. Keep going.';
  }

  // The target is already as low as we would ever recommend.
  if (plan.dailyAdjustment === 0) {
    return (
      `Your target is already at the lowest we would recommend, so there is nothing ` +
      `safe to trim. Carry on as normal and the trend absorbs this.`
    );
  }

  if (plan.days > RECOVERY_DAYS) {
    return (
      `To get back on track, eat ${cal(plan.dailyAdjustment)} fewer calories a day for ` +
      `the next ${plan.days} days — a target of ${cal(plan.adjustedTarget)}. We have ` +
      `spread it over longer than a month so you never have to drop below ` +
      `${cal(safeMinimum)} calories.`
    );
  }

  return (
    `To get back on track in ${RECOVERY_DAYS} days, eat ${cal(plan.dailyAdjustment)} ` +
    `fewer calories a day — a target of ${cal(plan.adjustedTarget)} instead of ` +
    `${cal(target)}.`
  );
}

export function DeficitSummaryCard({ pace, range, sex }: {
  pace: PaceSummary;
  range: TrendRange;
  sex: Sex;
}) {
  const safeMinimum = SAFE_MIN_CALORIES[sex];
  const plan = pace.worthChasing
    ? planRecovery(pace.gapPerDay, pace.gapTotal, pace.targetCalories, sex)
    : planRecovery(0, 0, pace.targetCalories, sex);
  const onTrack = !plan.needed;

  return (
    <Card>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Goal deficit" value={signed(pace.targetPerDay)} />
        <Stat
          label="Your average"
          value={signed(pace.actualPerDay)}
          tone={pace.actualPerDay > 0 ? 'good' : 'warn'}
        />
        <Stat
          label="Status"
          value={onTrack ? 'On track' : 'Behind'}
          tone={onTrack ? 'good' : 'warn'}
        />
      </div>

      <p className="mt-3 text-sm text-slate-600">
        {verdict(pace, plan, safeMinimum, pace.targetCalories)}
      </p>

      {/* The maintenance figure itself is named in the box above, so this says
          only what the numbers are measured over. */}
      <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
        Calories per day against maintenance, across the {pace.daysLogged}{' '}
        {pace.daysLogged === 1 ? 'day' : 'days'} you logged in {RANGE_LABELS[range]}.
      </p>
    </Card>
  );
}
