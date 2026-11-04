// Today's rules, as a checklist built for a thumb.
//
// Only rules that apply today are shown, so a weekday rule does not sit there
// on a Saturday looking like something you failed to do. Nothing needs
// clearing at the end of the day: check-offs live on the day's own document,
// so tomorrow starts blank on its own.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  appliesOn, currentStreak, isMet, sortRules, weeklyLimitStatus, weeklyLimitStreak,
} from '../lib/rules';
import type { DayKey } from '../lib/dates';
import type { DayLog, Rule } from '../lib/types';
import { Card, NumberInput } from './ui';

interface Props {
  rules: Rule[];
  date: DayKey;
  day: DayLog | null;
  /** This week only, for the weekly-limit line. */
  weekDays: DayLog[];
  /** Enough history for the streak numbers. */
  historyDays: DayLog[];
  onChange: (ruleId: string, value: boolean | number | undefined) => void;
}

export function RuleChecklist({ rules, date, day, weekDays, historyDays, onChange }: Props) {
  const todays = sortRules(rules).filter((rule) => appliesOn(rule, date));

  if (rules.length === 0) {
    return (
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-ink-soft">
          Rules are the habits you want to hold yourself to — no weekday drinking,
          10k steps, eating out once a week.
        </p>
        <Link to="/rules/edit" className="text-sm font-bold text-brand">
          Create your first rule &rarr;
        </Link>
      </Card>
    );
  }

  if (todays.length === 0) {
    return (
      <Card>
        <p className="text-sm text-ink-mute">No rules apply today. Enjoy it.</p>
      </Card>
    );
  }

  return (
    <ul className="space-y-2">
      {todays.map((rule) => {
        const value = day?.rules?.[rule.id];
        const streak =
          rule.type === 'weeklyLimit'
            ? weeklyLimitStreak(rule, historyDays, date)
            : currentStreak(rule, historyDays, date);

        if (rule.type === 'numeric') {
          return (
            <NumericRow
              key={rule.id}
              rule={rule}
              value={value}
              streak={streak}
              onCommit={onChange}
            />
          );
        }

        return (
          <CheckRow
            key={rule.id}
            rule={rule}
            checked={value === true}
            streak={streak}
            weekly={
              rule.type === 'weeklyLimit' ? weeklyLimitStatus(rule, weekDays, date) : null
            }
            onToggle={(next) => onChange(rule.id, next || undefined)}
          />
        );
      })}
    </ul>
  );
}

/** Small, never shouty. A streak is encouragement, not a scoreboard. */
function Streak({ count, weekly }: { count: number; weekly: boolean }) {
  if (count === 0) return null;
  const unit = weekly
    ? count === 1
      ? 'week'
      : 'weeks'
    : count === 1
      ? 'day'
      : 'days';
  return (
    <span className="block text-xs text-ink-ghost">
      {count} {unit} in a row
    </span>
  );
}

/** A yes/no or weekly-limit rule. The whole row is the tap target. */
function CheckRow({ rule, checked, streak, weekly, onToggle }: {
  rule: Rule;
  checked: boolean;
  streak: number;
  weekly: ReturnType<typeof weeklyLimitStatus> | null;
  onToggle: (next: boolean) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onToggle(!checked)}
        aria-pressed={checked}
        className={`flex w-full items-center gap-3 rounded-card border px-[18px] py-4 text-left
          shadow-card transition ${
            checked
              ? 'border-brand bg-brand-wash'
              : 'border-line bg-surface hover:bg-muted'
          }`}
      >
        <Tick checked={checked} />
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[17px] font-extrabold ${
              checked ? 'text-brand' : 'text-ink'
            }`}
          >
            {rule.name}
          </span>
          {weekly ? (
            <span
              className={`block text-xs ${
                weekly.withinLimit ? 'text-ink-mute' : 'text-over'
              }`}
            >
              {weekly.used} of {weekly.limit} used this week
              {!weekly.withinLimit && ' — over, but next week is a clean slate'}
            </span>
          ) : (
            <Streak count={streak} weekly={false} />
          )}
        </span>
      </button>
    </li>
  );
}

/**
 * A numeric rule's daily figure.
 *
 * Two ways in, because both get wanted: type the real number, or tap Done and
 * have the goal recorded. The typed value is held locally and written once the
 * field is left or Enter is pressed — saving per keystroke would mean a write
 * and a confirmation for every digit of "10000".
 */
function NumericRow({ rule, value, streak, onCommit }: {
  rule: Rule;
  value: boolean | number | undefined;
  streak: number;
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
    <li
      className={`rounded-card border px-[18px] py-4 shadow-card transition ${
        met ? 'border-brand bg-brand-wash' : 'border-line bg-surface'
      }`}
    >
      <div className="flex items-center gap-3">
        <Tick checked={met} />
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[17px] font-extrabold ${met ? 'text-brand' : 'text-ink'}`}>
            {rule.name}
          </p>
          <p className="text-xs text-ink-mute">
            Goal {rule.target.toLocaleString()} {rule.unit ?? ''}
          </p>
          <Streak count={streak} weekly={false} />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 pl-11">
        <span className="w-28">
          <NumberInput
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            placeholder={rule.unit ?? 'Amount'}
            aria-label={rule.name}
            className={met ? 'border-brand' : ''}
          />
        </span>
        <button
          type="button"
          onClick={() => onCommit(rule.id, met ? undefined : rule.target)}
          className={`h-[46px] shrink-0 rounded-input border px-4 text-sm font-bold transition ${
            met
              ? 'border-line-in bg-surface text-ink-mute hover:bg-muted'
              : 'border-brand bg-brand-wash text-brand hover:bg-brand-pill'
          }`}
        >
          {met ? 'Clear' : 'Done'}
        </button>
      </div>
    </li>
  );
}

/** The checkmark itself: big enough to read at a glance. */
function Tick({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2
        transition ${
          checked
            ? 'border-brand bg-brand text-white'
            : 'border-line-in bg-surface text-transparent'
        }`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5">
        <path
          d="M5 13l4 4L19 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
