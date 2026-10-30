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

import type { CatchUpPlan } from '../lib/catchup';
import type { PaceSummary } from '../lib/pace';
import { Card } from './ui';

const cal = (value: number): string => Math.abs(Math.round(value)).toLocaleString();

interface Props {
  plan: CatchUpPlan;
  /** This week's standing — what the plan is working to restore. */
  week: PaceSummary;
  /** This month's standing — the reassuring context. */
  month: PaceSummary;
  missedDays: number;
}

/**
 * The lead line: what is going well.
 *
 * Deliberately never starts with the overage. "You're still 1,200 calories
 * below maintenance this month" is both true and the thing worth knowing.
 */
function progressLine(month: PaceSummary): string | null {
  if (month.status === 'no-data') return null;

  if (month.actualTotal > 0) {
    return `You're still ${cal(month.actualTotal)} calories below maintenance this month.`;
  }
  if (month.actualTotal === 0) {
    return 'Across the month you are sitting right at maintenance.';
  }
  return `You're ${cal(month.actualTotal)} calories above maintenance this month so far.`;
}

export function CatchUpCard({ plan, week, month, missedDays }: Props) {
  const progress = progressLine(month);
  const needsPlan = plan.needed && week.worthChasing;

  if (!needsPlan && missedDays === 0) return null;

  // Nothing to undo, but days are missing: reassure and move on.
  if (!needsPlan) {
    return (
      <Card className="border-slate-200 bg-slate-50">
        <h3 className="text-sm font-semibold text-slate-900">
          {missedDays === 1 ? 'A day without a log' : `${missedDays} days without a log`}
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          {progress ? `${progress} ` : ''}
          No harm done — what you did log is on track. Pick it back up today; the trend is
          what counts, not any single day.
        </p>
      </Card>
    );
  }

  // The target is already at the lowest we would recommend, so there is
  // genuinely nothing safe to trim. Saying so plainly beats inventing a cut.
  if (plan.dailyAdjustment === 0) {
    return (
      <Card className="border-slate-200 bg-slate-50">
        <h3 className="text-sm font-semibold text-slate-900">
          {progress ?? 'One weekend has not undone your month.'}
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          You are {cal(week.gapTotal)} short of your pace for the week, but your target is
          already at the lowest we would recommend — so there is nothing safe to trim.
          Carry on as normal and this washes out of the trend over the next week or two.
        </p>
      </Card>
    );
  }

  return (
    <Card className="border-brand-200 bg-brand-50">
      <h3 className="text-sm font-semibold text-brand-900">
        {progress ?? 'Still moving in the right direction.'}
      </h3>

      {month.actualTotal > 0 && (
        <p className="mt-1 text-sm text-brand-800">One weekend didn&rsquo;t undo that.</p>
      )}

      <p className="mt-3 text-sm text-brand-800">
        To get back on pace for the week:{' '}
        <strong>
          eat {plan.dailyAdjustment.toLocaleString()} fewer calories a day for {plan.days}{' '}
          {plan.days === 1 ? 'day' : 'days'}
        </strong>{' '}
        — a target of {plan.adjustedTarget.toLocaleString()} instead of{' '}
        {week.targetCalories.toLocaleString()}.
      </p>

      <dl className="mt-3 space-y-1 border-t border-brand-200 pt-3 text-xs text-brand-800">
        <div className="flex justify-between gap-3">
          <dt>Short of pace this week</dt>
          <dd className="font-semibold">{cal(week.gapTotal)} cal</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Below maintenance this month</dt>
          <dd className="font-semibold">
            {month.actualTotal >= 0 ? '' : '+'}
            {cal(month.actualTotal)} cal
          </dd>
        </div>
      </dl>

      {!plan.fullyCovered && (
        <p className="mt-3 text-sm text-brand-800">
          We are deliberately letting the last {cal(plan.shortfallCalories)} go. Chasing all
          of it would mean cutting further than is sensible, and the trend will absorb it on
          its own.
        </p>
      )}

      <p className="mt-3 text-xs text-brand-700">
        Nothing is ruined. This is a rounding error against a month of consistency.
      </p>
    </Card>
  );
}
