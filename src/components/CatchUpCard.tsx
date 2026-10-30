// Catch-up guidance.
//
// The copy here matters as much as the arithmetic. Someone who has just gone
// over does not need to be told off — they need to see that the damage is
// small, bounded, and already handled.

import type { CatchUpPlan } from '../lib/catchup';
import { Card } from './ui';

export function CatchUpCard({ plan, missedDays }: { plan: CatchUpPlan; missedDays: number }) {
  if (!plan.needed && missedDays === 0) return null;

  // Nothing to undo, but days are missing: reassure and move on.
  if (!plan.needed) {
    return (
      <Card className="border-slate-200 bg-slate-50">
        <h3 className="text-sm font-semibold text-slate-900">
          {missedDays === 1 ? 'A day without a log' : `${missedDays} days without a log`}
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          No harm done — what you did log is on track. Pick it back up today; the trend is
          what counts, not any single day.
        </p>
      </Card>
    );
  }

  if (plan.dailyAdjustment === 0) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <h3 className="text-sm font-semibold text-amber-900">
          {plan.surplusCalories.toLocaleString()} calories above target
        </h3>
        <p className="mt-2 text-sm text-amber-800">
          Your target is already at the lowest we would recommend, so there is nothing safe
          to trim. Carry on as normal — this will wash out of the trend over the next week
          or two.
        </p>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200 bg-amber-50">
      <h3 className="text-sm font-semibold text-amber-900">
        {plan.surplusCalories.toLocaleString()} calories above target
      </h3>

      <p className="mt-2 text-sm text-amber-800">
        That is about{' '}
        <strong>
          {plan.dailyAdjustment.toLocaleString()} fewer calories a day for {plan.days} days
        </strong>{' '}
        — a target of {plan.adjustedTarget.toLocaleString()} instead of{' '}
        {(plan.adjustedTarget + plan.dailyAdjustment).toLocaleString()}. Small enough that you
        will barely notice it.
      </p>

      {!plan.fullyCovered && (
        <p className="mt-2 text-sm text-amber-800">
          We are deliberately letting the last {plan.shortfallCalories.toLocaleString()} go.
          Chasing all of it would mean cutting further than is sensible, and the trend will
          absorb it on its own.
        </p>
      )}

      <p className="mt-3 text-xs text-amber-700">
        Nothing is ruined. This is a rounding error against a month of consistency.
      </p>
    </Card>
  );
}
