// What to do about where you are.
//
// The charts above say where that is; this says whether it needs correcting
// and, if so, by how much. A recovery instruction is a sentence, not a figure,
// which is why it gets a card of its own rather than being crammed into a
// stat tile where it would be unreadable on a phone.
//
// The verdict reads differently for each goal. Someone gaining who under-ate
// is just as behind as someone losing who over-ate, but the fix points the
// other way, so the sentence is built from the plan's own direction rather
// than assuming a deficit.

import { planRecovery, RECOVERY_DAYS, type CatchUpPlan } from '../lib/catchup';
import { RANGE_LABELS, type TrendRange } from '../lib/deficit';
import { describeAverage } from '../lib/goals';
import type { PaceSummary } from '../lib/pace';
import { SAFE_MIN_CALORIES } from '../lib/targets';
import type { Goal, Sex } from '../lib/types';
import { Card } from './ui';

const cal = (value: number): string => Math.abs(Math.round(value)).toLocaleString();

/** The one line that says where things stand and what, if anything, to do. */
function verdict(
  pace: PaceSummary,
  plan: CatchUpPlan,
  safeMinimum: number,
  target: number,
): string {
  if (!plan.needed) {
    if (pace.goal === 'maintain') {
      return pace.status === 'on-track'
        ? 'You are sitting where you meant to. Nothing to change.'
        : `Your average is ${describeAverage(pace.actualPerDay)}, which is further from ` +
          'maintenance than holding steady needs. Nudging it back brings you level.';
    }
    return pace.goal === 'gain'
      ? 'Your average is meeting the surplus your goal asks for. Keep going.'
      : 'Your average is meeting the deficit your goal asks for. Keep going.';
  }

  // Eating more has no safe floor to run into, so this branch only ever
  // applies to a target already as low as we would recommend going.
  if (plan.dailyAdjustment === 0) {
    return (
      `Your target is already at the lowest we would recommend, so there is nothing ` +
      `safe to trim. Carry on as normal and the trend absorbs this.`
    );
  }

  if (plan.fix === 'eat-more') {
    const extra = `eat ${cal(plan.dailyAdjustment)} more calories a day`;
    const to = `a target of ${cal(plan.adjustedTarget)} instead of ${cal(target)}`;
    return plan.fullyCovered
      ? `To get back on track in ${RECOVERY_DAYS} days, ${extra} — ${to}.`
      : `To get back on track, ${extra} for the next ${plan.days} days — ${to}. We are ` +
        `not chasing all of it: adding more than that in a day stops being food and ` +
        `starts being a challenge.`;
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

export function DeficitSummaryCard({ pace, range, sex, goal, target }: {
  pace: PaceSummary;
  range: TrendRange;
  sex: Sex;
  /** The goal in force now, which is what the labels describe. */
  goal: Goal;
  /**
   * Today's daily target. Distinct from `pace.targetCalories`, which is the
   * blend the period was actually measured against: the plan is advice about
   * the days ahead, so it adjusts the target you are on now, not an average
   * of targets some of which you have already left behind.
   */
  target: number;
}) {
  const safeMinimum = SAFE_MIN_CALORIES[sex];
  const plan = pace.worthChasing
    ? planRecovery(pace.gapPerDay, pace.gapTotal, target, sex, goal)
    : planRecovery(0, 0, target, sex, goal);

  // No stat row here any more: the chart above now carries "vs maintenance"
  // and "vs goal" for the same period, and printing the same two figures
  // twice on one screen invites the reader to hunt for the difference.
  return (
    <Card className="flex flex-col gap-3.5">
      <p className="text-sm text-ink-soft">
        {verdict(pace, plan, safeMinimum, target)}
      </p>

      {/* The maintenance figure itself is named in the box above, so this says
          only what the numbers are measured over. */}
      <p className="border-t border-line-soft pt-3 text-xs text-ink-faint">
        Calories per day against maintenance, across the {pace.daysLogged}{' '}
        {pace.daysLogged === 1 ? 'day' : 'days'} you logged in {RANGE_LABELS[range]}.
      </p>
    </Card>
  );
}
