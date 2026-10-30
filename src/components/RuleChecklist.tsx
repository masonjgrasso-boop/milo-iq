// Today's rules, checked off in place.
//
// Only rules that apply today are shown, so a weekday rule does not sit there
// on a Saturday looking like something you failed to do.

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
            const met = isMet(rule, value);
            return (
              <li key={rule.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{rule.name}</p>
                  <p className="text-xs text-slate-500">
                    Goal {rule.target.toLocaleString()} {rule.unit ?? ''}
                  </p>
                </div>
                <div className="flex w-32 shrink-0 items-center gap-2">
                  <NumberInput
                    value={value === undefined ? '' : String(value)}
                    onChange={(event) =>
                      onChange(
                        rule.id,
                        event.target.value === '' ? undefined : Number(event.target.value),
                      )
                    }
                    aria-label={rule.name}
                    className={met ? 'border-brand-500 bg-brand-50' : ''}
                  />
                </div>
              </li>
            );
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
