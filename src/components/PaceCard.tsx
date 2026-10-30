// The three numbers: where you are, where you meant to be, and the gap.
//
// The headline always states the progress first. Someone opening this the
// morning after a heavy weekend should read "still 1,200 below maintenance"
// before they read anything about a shortfall, because the first of those is
// the true one and the second is a detail.

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

  // Gaining: the surplus is the progress, so read the numbers the other way up.
  if (pace.goal === 'gain') {
    return pace.actualPerDay < 0
      ? `You're averaging ${cal(pace.actualPerDay)} calories above maintenance ${when}.`
      : `You're averaging ${cal(pace.actualPerDay)} calories below maintenance ${when}.`;
  }

  if (pace.status === 'above-maintenance') {
    return pace.actualPerDay === 0
      ? `You're eating right at maintenance ${when}.`
      : `You're averaging ${cal(pace.actualPerDay)} calories above maintenance ${when}.`;
  }

  return `You're averaging ${cal(pace.actualPerDay)} calories below maintenance ${when}.`;
}

/** The second line: what the numbers mean, in the app's own voice. */
function detail(pace: PaceSummary, scope: PaceScope): string | null {
  const when = SCOPE_WORDS[scope];

  switch (pace.status) {
    case 'no-data':
      return 'Log something and the numbers start filling in.';
    case 'ahead':
      return pace.goal === 'maintain'
        ? 'Comfortably inside where you wanted to be. Nothing to change.'
        : `That is ahead of the ${cal(pace.targetPerDay)} a day your goal asks for. ` +
          'Nothing to change.';
    case 'on-track':
      return `Right on the ${cal(pace.targetPerDay)} a day your goal asks for.`;
    case 'behind':
      return (
        `Your goal asks for ${cal(pace.targetPerDay)} a day, so you are ` +
        `${cal(pace.gapPerDay)} short — ${cal(pace.gapTotal)} across the ` +
        `${pace.daysLogged} ${pace.daysLogged === 1 ? 'day' : 'days'} you logged ${when}.`
      );
    case 'above-maintenance':
      return (
        'That means no deficit so far, which is a flat week rather than a lost one. ' +
        'The trend is what moves the scale.'
      );
  }
}

const SOURCE_NOTE: Record<MaintenanceSource, string> = {
  measured: 'Maintenance measured from your own logs',
  estimated: 'Maintenance is still a starting estimate',
};

export function PaceCard({ pace, scope, source }: {
  pace: PaceSummary;
  scope: PaceScope;
  source: MaintenanceSource;
}) {
  const note = detail(pace, scope);
  const behind = pace.status === 'behind' || pace.status === 'above-maintenance';

  return (
    <Card>
      <p className="text-base font-semibold text-slate-900">{headline(pace, scope)}</p>
      {note && <p className="mt-1.5 text-sm text-slate-600">{note}</p>}

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3">
        <Stat
          label="Below maintenance"
          value={`${pace.actualPerDay >= 0 ? '' : '+'}${cal(pace.actualPerDay)}`}
          tone={pace.actualPerDay > 0 ? 'good' : 'warn'}
        />
        <Stat label="Your goal asks" value={cal(pace.targetPerDay)} />
        <Stat
          label={pace.gapPerDay > 0 ? 'Short by' : 'Ahead by'}
          value={cal(pace.gapPerDay)}
          tone={behind ? 'warn' : 'good'}
        />
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Calories per day, averaged across the {pace.daysLogged}{' '}
        {pace.daysLogged === 1 ? 'day' : 'days'} you logged {SCOPE_WORDS[scope]} &middot;{' '}
        {SOURCE_NOTE[source]}
      </p>
    </Card>
  );
}
