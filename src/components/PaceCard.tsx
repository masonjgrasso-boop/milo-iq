// The three numbers: where you are, where you meant to be, and the gap.
//
// The headline always states the progress first. Someone opening this the
// morning after a heavy weekend should read "still 1,200 below maintenance"
// before they read anything about a shortfall, because the first of those is
// the true one and the second is a detail.
//
// Every word here comes from the goal in force. For someone gaining, the
// surplus is the progress and falling short of it is put right by eating more,
// so the labels and the advice flip rather than the raw numbers being shown.

import { describeAverage, progressToward, GOAL_GAP_LABEL } from '../lib/goals';
import type { MaintenanceSource, PaceSummary } from '../lib/pace';
import { Card, Stat } from './ui';

const cal = (value: number): string => Math.abs(Math.round(value)).toLocaleString();

/** "this week" / "this month" / "today", for use inside a sentence. */
export type PaceScope = 'day' | 'week' | 'month';

const SCOPE_WORDS: Record<PaceScope, string> = {
  day: 'today',
  week: 'this week',
  month: 'this month',
};

/** The progress-first headline, which is the whole point of this card. */
function headline(pace: PaceSummary, scope: PaceScope): string {
  const when = SCOPE_WORDS[scope];

  if (pace.status === 'no-data') {
    return `Nothing logged ${when} yet.`;
  }

  // Which side of maintenance the average sits on is the same sentence for
  // every goal; what differs is whether that side is the one you wanted.
  if (Math.round(pace.actualPerDay) === 0) {
    return `You're eating right at maintenance ${when}.`;
  }
  return `You're averaging ${describeAverage(pace.actualPerDay)} ${when}.`;
}

/** The second line: what the numbers mean, in the app's own voice. */
function detail(pace: PaceSummary, scope: PaceScope): string | null {
  const when = SCOPE_WORDS[scope];
  const asks = cal(pace.targetPerDay);
  const maintaining = pace.goal === 'maintain';

  switch (pace.status) {
    case 'no-data':
      return 'Log something and the numbers start filling in.';
    case 'ahead':
      return maintaining
        ? 'Comfortably inside where you wanted to be. Nothing to change.'
        : `That is ahead of the ${asks} a day your goal asks for. Nothing to change.`;
    case 'on-track':
      return maintaining
        ? 'Close enough to maintenance to be holding steady.'
        : `Right on the ${asks} a day your goal asks for.`;
    case 'behind':
      return (
        `Your goal asks for ${asks} a day, so you are ` +
        `${cal(pace.gapPerDay)} short — ${cal(pace.gapTotal)} across the ` +
        `${pace.daysLogged} ${pace.daysLogged === 1 ? 'day' : 'days'} you logged ${when}.`
      );
    case 'above-maintenance':
      return maintaining
        ? 'That is drifting up rather than holding steady. Easing back a little brings ' +
          'it level.'
        : 'That means no deficit so far, which is a flat week rather than a lost one. ' +
          'The trend is what moves the scale.';
    case 'under-maintenance':
      // The mirror image, and the one place this card says "eat a bit more".
      return maintaining
        ? 'That is drifting down rather than holding steady. A little more food brings ' +
          'it level.'
        : 'That means no surplus so far, so there is nothing to build with yet. A bit ' +
          'more each day is all it takes.';
  }
}

const SOURCE_NOTE: Record<MaintenanceSource, string> = {
  measured: 'maintenance measured from your own logs',
  estimated: 'maintenance is still a starting estimate',
};

export function PaceCard({ pace, scope, source }: {
  pace: PaceSummary;
  scope: PaceScope;
  source: MaintenanceSource;
}) {
  const note = detail(pace, scope);
  const maintaining = pace.goal === 'maintain';
  const offPlan = pace.status === 'behind'
    || pace.status === 'above-maintenance'
    || pace.status === 'under-maintenance';

  // Positive means the average moved the way the goal wanted, whichever goal
  // that is. The label names the side, so the figure stays a magnitude.
  const progress = progressToward(pace.goal, pace.actualPerDay);
  const sideLabel = pace.actualPerDay >= 0 ? 'Below maint.' : 'Above maint.';

  return (
    <Card className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <p className="text-[17px] font-extrabold text-ink">{headline(pace, scope)}</p>
        {note && <p className="text-sm text-ink-mute">{note}</p>}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat
          label={sideLabel}
          value={cal(pace.actualPerDay)}
          tone={progress > 0 ? 'good' : 'warn'}
        />
        <Stat
          label={GOAL_GAP_LABEL[pace.goal]}
          value={maintaining ? 'Maintenance' : cal(pace.targetPerDay)}
        />
        {maintaining ? (
          <Stat
            label="Off by"
            value={cal(pace.actualPerDay)}
            tone={pace.status === 'on-track' ? 'good' : 'warn'}
          />
        ) : (
          <Stat
            label={pace.gapPerDay > 0 ? 'Short by' : 'Ahead by'}
            value={cal(pace.gapPerDay)}
            tone={offPlan ? 'warn' : 'good'}
          />
        )}
      </div>

      <p className="text-xs text-ink-faint">
        Calories per day, averaged across the {pace.daysLogged}{' '}
        {pace.daysLogged === 1 ? 'day' : 'days'} you logged {SCOPE_WORDS[scope]} &middot;{' '}
        {SOURCE_NOTE[source]}
      </p>
    </Card>
  );
}
