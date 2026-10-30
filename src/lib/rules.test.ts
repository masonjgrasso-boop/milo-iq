import { describe, it, expect } from 'vitest';
import {
  appliesOn, isMet, dayStatus, currentStreak, weekSummary,
  weeklyLimitStatus, weeklyLimitStreak, RULE_TYPE_LABELS,
} from './rules';
import { rangeKeys } from './dates';
import type { DayLog, Rule } from './types';

const yesNo: Rule = {
  id: 'r1', name: 'No weekday drinking', type: 'boolean', target: 0,
  daysOfWeek: [0, 1, 2, 3, 4], active: true,
};
const steps: Rule = {
  id: 'r2', name: '10k steps', type: 'numeric', target: 10_000, unit: 'steps',
  daysOfWeek: [], active: true,
};
const eatOut: Rule = {
  id: 'r3', name: 'Eat out max 1 day/week', type: 'weeklyLimit', target: 1,
  daysOfWeek: [], active: true,
};

/** Days from Monday 2026-03-02 onward, with rule values supplied per date. */
function buildDays(
  from: string,
  to: string,
  values: Record<string, Record<string, boolean | number>> = {},
): DayLog[] {
  return rangeKeys(from, to).map((date) => ({
    date, calories: 0, entries: [], ...(values[date] ? { rules: values[date] } : {}),
  }));
}

describe('appliesOn', () => {
  it('applies every day when no weekdays are set', () => {
    expect(appliesOn(steps, '2026-03-07')).toBe(true); // Saturday
  });

  it('applies only on the chosen weekdays', () => {
    expect(appliesOn(yesNo, '2026-03-04')).toBe(true); // Wednesday
    expect(appliesOn(yesNo, '2026-03-07')).toBe(false); // Saturday
    expect(appliesOn(yesNo, '2026-03-08')).toBe(false); // Sunday
  });

  it('does not apply before the rule was created', () => {
    const started = { ...steps, startDate: '2026-03-04' };
    expect(appliesOn(started, '2026-03-03')).toBe(false);
    expect(appliesOn(started, '2026-03-04')).toBe(true);
    expect(appliesOn(started, '2026-03-05')).toBe(true);
  });

  it('never applies when the rule is switched off', () => {
    expect(appliesOn({ ...steps, active: false }, '2026-03-04')).toBe(false);
  });
});

describe('isMet', () => {
  it('needs an explicit yes for a yes/no rule', () => {
    expect(isMet(yesNo, true)).toBe(true);
    expect(isMet(yesNo, false)).toBe(false);
    expect(isMet(yesNo, undefined)).toBe(false);
  });

  it('needs the target or better for a numeric rule', () => {
    expect(isMet(steps, 10_000)).toBe(true);
    expect(isMet(steps, 12_000)).toBe(true);
    expect(isMet(steps, 9_999)).toBe(false);
  });
});

describe('dayStatus', () => {
  const today = '2026-03-04';
  const day = (date: string, value?: boolean | number): DayLog => ({
    date, calories: 0, entries: [], ...(value === undefined ? {} : { rules: { r1: value } }),
  });

  it('is off on a day the rule does not cover', () => {
    expect(dayStatus(yesNo, day('2026-03-07'), today)).toBe('off');
  });

  it('is pending for an unanswered today', () => {
    expect(dayStatus(yesNo, day(today), today)).toBe('pending');
  });

  it('is missed for an unanswered past day', () => {
    expect(dayStatus(yesNo, day('2026-03-03'), today)).toBe('missed');
  });

  it('reads the recorded value', () => {
    expect(dayStatus(yesNo, day('2026-03-03', true), today)).toBe('met');
    expect(dayStatus(yesNo, day('2026-03-03', false), today)).toBe('missed');
  });

  it('leaves today pending when the number is short of the goal', () => {
    const partial: DayLog = { date: today, calories: 0, entries: [], rules: { r2: 4_000 } };
    expect(dayStatus(steps, partial, today)).toBe('pending');
  });

  it('counts today as met as soon as the goal is reached', () => {
    const done: DayLog = { date: today, calories: 0, entries: [], rules: { r2: 10_000 } };
    expect(dayStatus(steps, done, today)).toBe('met');
  });

  it('is off for days before the rule existed', () => {
    const started = { ...yesNo, startDate: '2026-03-04' };
    expect(dayStatus(started, day('2026-03-03'), today)).toBe('off');
  });
});

describe('currentStreak', () => {
  const today = '2026-03-06'; // Friday

  it('counts consecutive met days', () => {
    const days = buildDays('2026-03-02', today, {
      '2026-03-02': { r1: true }, '2026-03-03': { r1: true },
      '2026-03-04': { r1: true }, '2026-03-05': { r1: true }, '2026-03-06': { r1: true },
    });
    expect(currentStreak(yesNo, days, today)).toBe(5);
  });

  it('ends at the first missed day', () => {
    const days = buildDays('2026-03-02', today, {
      '2026-03-02': { r1: true }, '2026-03-03': { r1: false },
      '2026-03-04': { r1: true }, '2026-03-05': { r1: true }, '2026-03-06': { r1: true },
    });
    expect(currentStreak(yesNo, days, today)).toBe(3);
  });

  it('survives the weekend for a weekday-only rule', () => {
    // Fri 6th and Mon 9th met; the weekend in between does not break it.
    const days = buildDays('2026-03-02', '2026-03-09', {
      '2026-03-05': { r1: true }, '2026-03-06': { r1: true }, '2026-03-09': { r1: true },
    });
    expect(currentStreak(yesNo, days, '2026-03-09')).toBe(3);
  });

  it('is not ended by an unanswered today', () => {
    const days = buildDays('2026-03-02', today, {
      '2026-03-04': { r1: true }, '2026-03-05': { r1: true },
    });
    expect(currentStreak(yesNo, days, today)).toBe(2);
  });

  it('is zero when yesterday was missed', () => {
    const days = buildDays('2026-03-02', today, { '2026-03-05': { r1: false } });
    expect(currentStreak(yesNo, days, today)).toBe(0);
  });

  it('is ended by a gap in the records', () => {
    // No entry at all for the 4th, which for a past day is a miss.
    const days = buildDays('2026-03-02', today, {
      '2026-03-05': { r1: true }, '2026-03-06': { r1: true },
    }).filter((day) => day.date !== '2026-03-04');
    expect(currentStreak(yesNo, days, today)).toBe(2);
  });

  it('returns zero with no data', () => {
    expect(currentStreak(yesNo, [], today)).toBe(0);
  });

  it('works for numeric rules', () => {
    const days = buildDays('2026-03-04', today, {
      '2026-03-04': { r2: 11_000 }, '2026-03-05': { r2: 10_000 }, '2026-03-06': { r2: 10_500 },
    });
    expect(currentStreak(steps, days, today)).toBe(3);
  });

  it('holds the streak while today is still short of the goal', () => {
    // 4,000 steps at lunchtime is a day in progress, not a broken streak.
    const days = buildDays('2026-03-04', today, {
      '2026-03-04': { r2: 11_000 }, '2026-03-05': { r2: 10_000 }, '2026-03-06': { r2: 4_000 },
    });
    expect(currentStreak(steps, days, today)).toBe(2);
  });

  it('is ended by a past day that fell short', () => {
    const days = buildDays('2026-03-04', today, {
      '2026-03-04': { r2: 11_000 }, '2026-03-05': { r2: 4_000 }, '2026-03-06': { r2: 10_000 },
    });
    expect(currentStreak(steps, days, today)).toBe(1); // today only
  });
});

describe('weekSummary', () => {
  const today = '2026-03-08';

  it('counts met against applicable days', () => {
    const days = buildDays('2026-03-02', '2026-03-08', {
      '2026-03-02': { r1: true }, '2026-03-03': { r1: true },
      '2026-03-04': { r1: false }, '2026-03-05': { r1: true }, '2026-03-06': { r1: true },
    });
    const summary = weekSummary(yesNo, days, today);
    expect(summary.applicable).toBe(5); // weekdays only
    expect(summary.met).toBe(4);
    expect(summary.percent).toBe(80);
  });

  it('ignores the days before the rule was created', () => {
    // The reported bug: a daily rule added on Thursday read the whole week
    // back to Monday as missed, showing "0 of 4 days".
    const rule = { ...steps, startDate: '2026-03-05' };
    const days = buildDays('2026-03-02', '2026-03-08');
    const summary = weekSummary(rule, days, today);
    expect(summary.applicable).toBe(3); // Thu, Fri, Sat — not Mon to Wed
    expect(summary.met).toBe(0);
  });

  it('counts today as soon as it is checked off', () => {
    const rule = { ...steps, startDate: '2026-03-06' };
    const unchecked = weekSummary(rule, buildDays('2026-03-06', '2026-03-08'), '2026-03-06');
    expect(unchecked.applicable).toBe(0);

    const checked = weekSummary(
      rule,
      buildDays('2026-03-06', '2026-03-08', { '2026-03-06': { r2: 12_000 } }),
      '2026-03-06',
    );
    expect(checked.applicable).toBe(1);
    expect(checked.met).toBe(1);
    expect(checked.percent).toBe(100);
  });

  it('reports zero rather than dividing by zero', () => {
    const summary = weekSummary(yesNo, buildDays('2026-03-07', '2026-03-08'), today);
    expect(summary.applicable).toBe(0);
    expect(summary.percent).toBe(0);
  });
});

describe('weeklyLimitStatus', () => {
  it('counts the days it happened this week', () => {
    const days = buildDays('2026-03-02', '2026-03-08', {
      '2026-03-04': { r3: true }, '2026-03-07': { r3: true },
    });
    const status = weeklyLimitStatus(eatOut, days, '2026-03-05');
    expect(status.used).toBe(2);
    expect(status.limit).toBe(1);
    expect(status.withinLimit).toBe(false);
    expect(status.remaining).toBe(0);
  });

  it('is within the limit at exactly the limit', () => {
    const days = buildDays('2026-03-02', '2026-03-08', { '2026-03-04': { r3: true } });
    const status = weeklyLimitStatus(eatOut, days, '2026-03-05');
    expect(status.withinLimit).toBe(true);
    expect(status.remaining).toBe(0);
  });

  it('ignores days in other weeks', () => {
    const days = buildDays('2026-02-23', '2026-03-08', {
      '2026-02-25': { r3: true }, '2026-02-26': { r3: true },
    });
    expect(weeklyLimitStatus(eatOut, days, '2026-03-05').used).toBe(0);
  });
});

describe('weeklyLimitStatus with a start date', () => {
  it('ignores uses recorded before the rule existed', () => {
    const rule = { ...eatOut, startDate: '2026-03-05' };
    const days = buildDays('2026-03-02', '2026-03-08', {
      '2026-03-03': { r3: true }, '2026-03-06': { r3: true },
    });
    expect(weeklyLimitStatus(rule, days, '2026-03-08').used).toBe(1);
  });
});

describe('weeklyLimitStreak', () => {
  it('counts completed weeks within the limit', () => {
    const days = buildDays('2026-02-16', '2026-03-08', {
      '2026-02-18': { r3: true }, // week of Feb 16: 1 use, fine
      '2026-02-24': { r3: true }, // week of Feb 23: 1 use, fine
      '2026-03-05': { r3: true }, // current week, not counted
    });
    expect(weeklyLimitStreak(eatOut, days, '2026-03-05')).toBe(2);
  });

  it('stops at the first week over the limit', () => {
    const days = buildDays('2026-02-16', '2026-03-08', {
      '2026-02-24': { r3: true }, '2026-02-25': { r3: true }, // 2 uses: over
      '2026-03-02': { r3: true }, // current week
    });
    expect(weeklyLimitStreak(eatOut, days, '2026-03-05')).toBe(0);
  });

  it('does not credit weeks before the rule existed', () => {
    const rule = { ...eatOut, startDate: '2026-03-02' };
    // Eight weeks of clean logs, but the rule has only existed for one.
    const days = buildDays('2026-01-05', '2026-03-08');
    expect(weeklyLimitStreak(rule, days, '2026-03-11')).toBe(1);
  });

  it('returns zero with no history', () => {
    expect(weeklyLimitStreak(eatOut, [], '2026-03-05')).toBe(0);
  });
});

describe('labels', () => {
  it('has one for every rule type', () => {
    expect(Object.keys(RULE_TYPE_LABELS).sort()).toEqual(
      ['boolean', 'numeric', 'weeklyLimit'],
    );
  });
});
