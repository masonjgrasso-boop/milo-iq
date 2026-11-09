// Catch-up guidance.
//
// The copy here matters as much as the arithmetic. Someone who has just gone
// over does not need to be told off — they need to see that the damage is
// small, bounded, and already handled.
//
// So the order is fixed: the progress comes first, always. The month's figure
// leads, because one weekend is a small thing against a month and the number
// says so. Only then comes the adjustment, described as a small daily change
// rather than a punishment.
//
// All of that holds whichever way the goal points. Someone gaining who had a
// light week is behind in exactly the same way, and gets the same treatment:
// the month's progress first, then a small daily nudge upward.

import type { CatchUpPlan } from '../lib/catchup';
import { describeAverage } from '../lib/goals';
import type { PaceSummary } from '../lib/pace';
import { Card } from './ui';

const cal = (value: number): string => Math.abs(Math.round(value)).toLocaleString();

interface Props {
  plan: CatchUpPlan;
  /** This week's standing — what the plan is working to restore. */
  week: PaceSummary;
  /** This month's standing — the reassuring context. */
  month: PaceSummary;
  /**
   * Today's daily target, which is what the plan moves. The week's own figure
   * may be a blend of two goals if one changed mid-week, and quoting that as
   * the number being replaced would name a target the user is not on.
   */
  target: number;
  missedDays: number;
}

/**
 * The lead line: what is going well.
 *
 * Deliberately never starts with the shortfall. "You're still 1,200 calories
 * below maintenance this month" is both true and the thing worth knowing —
 * and for someone gaining, the surplus is that same good news, so the sign
 * that counts as progress follows the goal.
 */
function progressLine(month: PaceSummary): string | null {
  if (month.status === 'no-data') return null;

  if (month.goal === 'maintain') {
    return `Across the month you are averaging ${describeAverage(month.actualPerDay)}.`;
  }

  if (month.goal === 'gain') {
    return month.actualTotal < 0
      ? `You're ${cal(month.actualTotal)} calories above maintenance this month.`
      : `You're ${cal(month.actualTotal)} calories below maintenance this month so far.`;
  }

  if (month.actualTotal > 0) {
    return `You're still ${cal(month.actualTotal)} calories below maintenance this month.`;
  }
  if (month.actualTotal === 0) {
    return 'Across the month you are sitting right at maintenance.';
  }
  return `You're ${cal(month.actualTotal)} calories above maintenance this month so far.`;
}

/** Whether the month's figure is the good-news kind, so it can be leaned on. */
function monthIsProgress(month: PaceSummary): boolean {
  return month.goal === 'gain' ? month.actualTotal < 0 : month.actualTotal > 0;
}

export function CatchUpCard({ plan, week, month, target, missedDays }: Props) {
  const progress = progressLine(month);
  const needsPlan = plan.needed && week.worthChasing;
  const more = plan.fix === 'eat-more';

  if (!needsPlan && missedDays === 0) return null;

  // Nothing to undo, but days are missing: reassure and move on.
  if (!needsPlan) {
    return (
      <Card tone="cream">
        <h3 className="text-[17px] font-extrabold text-ink">
          {missedDays === 1 ? 'A day without a log' : `${missedDays} days without a log`}
        </h3>
        <p className="mt-2 text-sm text-ink-soft">
          {progress ? `${progress} ` : ''}
          No harm done — what you did log is on track. Pick it back up today; the trend is
          what counts, not any single day.
        </p>
      </Card>
    );
  }

  // The target is already at the lowest we would recommend, so there is
  // genuinely nothing safe to trim. Saying so plainly beats inventing a cut.
  // This cannot happen in the eat-more direction, which has no floor to hit.
  if (plan.dailyAdjustment === 0) {
    return (
      <Card tone="cream">
        <h3 className="text-[17px] font-extrabold text-ink">
          {progress ?? 'One weekend has not undone your month.'}
        </h3>
        <p className="mt-2 text-sm text-ink-soft">
          You are {cal(week.gapTotal)} short of your pace for the week, but your target is
          already at the lowest we would recommend — so there is nothing safe to trim.
          Carry on as normal and this washes out of the trend over the next week or two.
        </p>
      </Card>
    );
  }

  return (
    <Card tone="wash">
      <h3 className="text-sm font-semibold text-brand">
        {progress ?? 'Still moving in the right direction.'}
      </h3>

      {monthIsProgress(month) && (
        <p className="mt-1 text-sm text-brand">
          {more ? 'One light week didn’t undo that.' : 'One weekend didn’t undo that.'}
        </p>
      )}

      <p className="mt-3 text-sm text-brand">
        To get back on pace for the week:{' '}
        <strong>
          eat {plan.dailyAdjustment.toLocaleString()} {more ? 'more' : 'fewer'} calories a
          day for {plan.days} {plan.days === 1 ? 'day' : 'days'}
        </strong>{' '}
        — a target of {plan.adjustedTarget.toLocaleString()} instead of{' '}
        {target.toLocaleString()}.
      </p>

      <dl className="mt-3 space-y-1 border-t border-brand-pill pt-3 text-xs text-brand">
        <div className="flex justify-between gap-3">
          <dt>Short of pace this week</dt>
          <dd className="font-semibold">{cal(week.gapTotal)} cal</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>{month.actualTotal >= 0 ? 'Below' : 'Above'} maintenance this month</dt>
          <dd className="font-semibold">{cal(month.actualTotal)} cal</dd>
        </div>
      </dl>

      {!plan.fullyCovered && (
        <p className="mt-3 text-sm text-brand">
          {more
            ? `We are deliberately letting the last ${cal(plan.shortfallCalories)} go. ` +
              'Adding more than this in a day stops being food and starts being a ' +
              'challenge, and the trend will absorb it on its own.'
            : `We are deliberately letting the last ${cal(plan.shortfallCalories)} go. ` +
              'Chasing all of it would mean cutting further than is sensible, and the ' +
              'trend will absorb it on its own.'}
        </p>
      )}

      <p className="mt-3 text-xs text-brand">
        Nothing is ruined. This is a rounding error against a month of consistency.
      </p>
    </Card>
  );
}
