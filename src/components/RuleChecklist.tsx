// Today's rules, checked off in place.
//
// Only rules that apply today are shown, so a weekday rule does not sit there
// on a Saturday looking like something you failed to do.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { appliesOn, isMet, weeklyLimitStatus } from '../lib/rules';
import type { DayKey } from '../lib/dates';
import type { DayLog, Rule } from '../lib/types';
import { Card, NumberInput } from './ui';

interface Props {
  rules: Rule[];
  date: DayKey;
  day: DayLog | null;
  weekDays: DayLog[];
  onChange: (ruleId: string, value: boolean | number | undefined) => void;
}

export function RuleChecklist({ rules, date, day, weekDays, onChange }: Props) {
  const todays = rules.filter((rule) => appliesOn(rule, date));

  if (rules.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-600">
          Rules are the habits you want to hold yourself to — no weekday drinking,
          10k steps, eating out once a week.
        </p>
        <Link
          to="/rules"
          className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700"
        >
          Create your first rule &rarr;
        </Link>
      </Card>
    );
  }

  if (todays.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-500">No rules apply today. Enjoy it.</p>
      </Card>
    );
  }

  return (
    <Card>
      <ul className="divide-y divide-slate-100">
        {todays.map((rule) => {
          const value = day?.rules?.[rule.id];

          if (rule.type === 'numeric') {
            return <NumericRow key={rule.id} rule={rule} value={value} onCommit={onChange} />;
          }

          const checked = value === true;
          const weekly =
            rule.type === 'weeklyLimit' ? weeklyLimitStatus(rule, weekDays, date) : null;

          return (
            <li key={rule.id} className="py-3">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => onChange(rule.id, event.target.checked || undefined)}
                  className="h-5 w-5 shrink-0 rounded border-slate-300 accent-brand-600"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-900">{rule.name}</span>
                  {weekly && (
                    <span
                      className={`block text-xs ${
                        weekly.withinLimit ? 'text-slate-500' : 'text-amber-600'
                      }`}
                    >
                      {weekly.used} of {weekly.limit} used this week
                      {!weekly.withinLimit && ' — over, but next week is a clean slate'}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * A numeric rule's daily figure.
 *
 * The value is held locally while it is being typed and written once the field
 * is left or Enter is pressed. Saving per keystroke would mean a write and a
 * confirmation for every digit of "10000".
 */
function NumericRow({ rule, value, onCommit }: {
  rule: Rule;
  value: boolean | number | undefined;
  onCommit: (ruleId: string, value: boolean | number | undefined) => void;
}) {
  const stored = value === undefined ? '' : String(value);
  const [draft, setDraft] = useState(stored);
  const [lastStored, setLastStored] = useState(stored);

  // Follow the stored value when the day changes underneath us. Done during
  // render rather than in an effect so there is no flash of the stale number.
  if (lastStored !== stored) {
    setLastStored(stored);
    setDraft(stored);
  }

  const met = isMet(rule, draft === '' ? undefined : Number(draft));

  function commit() {
    if (draft === stored) return;
    const parsed = Number(draft);
    if (draft !== '' && !Number.isFinite(parsed)) {
      setDraft(stored);
      return;
    }
    onCommit(rule.id, draft === '' ? undefined : parsed);
  }

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-900">{rule.name}</p>
        <p className="text-xs text-slate-500">
          Goal {rule.target.toLocaleString()} {rule.unit ?? ''}
          {met && <span className="ml-1 font-medium text-brand-600">&middot; hit</span>}
        </p>
      </div>
      <div className="flex w-32 shrink-0 items-center gap-2">
        <NumberInput
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          aria-label={rule.name}
          className={met ? 'border-brand-500 bg-brand-50' : ''}
        />
      </div>
    </li>
  );
}
