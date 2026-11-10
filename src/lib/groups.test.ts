import { describe, it, expect } from 'vitest';
import {
  generateInviteCode, normalizeInviteCode, isValidInviteCode, INVITE_CODE_LENGTH,
  buildSharedSummary, daysInactive, isInactive, migrateShareFlags,
  DEFAULT_SHARING, INACTIVE_AFTER_DAYS, JOIN_SHARE_KEYS, NO_SHARING,
  SHARE_KEYS, SHARE_LABELS, SHARE_DESCRIPTIONS,
  type ShareFlags, type ShareInput,
} from './groups';
import { rangeKeys } from './dates';
import type { DayLog, Exercise, GoalPeriod, Rule } from './types';

describe('invite codes', () => {
  it('is the expected length', () => {
    expect(generateInviteCode()).toHaveLength(INVITE_CODE_LENGTH);
  });

  it('avoids characters that are easy to confuse', () => {
    // 100 codes is plenty to catch an alphabet that still contains O, 0, I or 1.
    for (let i = 0; i < 100; i++) {
      expect(generateInviteCode()).not.toMatch(/[O0I1]/);
    }
  });

  it('is deterministic given a fixed random source', () => {
    const fixed = () => 0;
    expect(generateInviteCode(fixed)).toBe(generateInviteCode(fixed));
  });

  it('produces different codes across calls', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateInviteCode()));
    expect(codes.size).toBeGreaterThan(40);
  });

  it('normalizes what the user types', () => {
    expect(normalizeInviteCode('  ab3-k9p ')).toBe('AB3K9P');
    expect(normalizeInviteCode('AB3K9P')).toBe('AB3K9P');
  });

  it('validates a well-formed code', () => {
    expect(isValidInviteCode(generateInviteCode())).toBe(true);
    expect(isValidInviteCode('ab3k9p')).toBe(true);
  });

  it('rejects wrong lengths and confusable characters', () => {
    expect(isValidInviteCode('AB3K9')).toBe(false);
    expect(isValidInviteCode('AB3K9PQ')).toBe(false);
    expect(isValidInviteCode('AB3K90')).toBe(false); // contains a zero
    expect(isValidInviteCode('')).toBe(false);
  });
});

const days: DayLog[] = rangeKeys('2026-03-02', '2026-03-06').map((date, index) => ({
  date,
  calories: 1900,
  entries: [],
  weightKg: 80 - index * 0.2,
  rules: { r1: true },
}));

const rules: Rule[] = [
  { id: 'r1', name: 'No weekday drinking', type: 'boolean', target: 0, daysOfWeek: [], active: true },
];

const exercises: Exercise[] = [
  { id: 'e1', name: 'Bench press', isCustom: false, bestE1rmKg: 110, lastDate: '2026-03-04' },
  { id: 'e2', name: 'Back squat', isCustom: false, bestE1rmKg: 150, lastDate: '2026-03-05' },
];

const allOn: ShareFlags = { stats: true, goals: true, photos: true, activity: true };

const input = (flags: ShareFlags): ShareInput => ({
  uid: 'u1',
  displayName: 'Sam',
  flags,
  days,
  today: '2026-03-06',
  targetCalories: 2000,
  units: 'imperial',
  rules,
  exercises,
  photos: [{ week: '2026-W10', thumbUrl: 'https://example.test/t.jpg' }],
});

describe('buildSharedSummary', () => {
  it('always identifies the member', () => {
    const summary = buildSharedSummary(input(NO_SHARING));
    expect(summary.uid).toBe('u1');
    expect(summary.displayName).toBe('Sam');
  });

  it('omits every section when nothing is shared', () => {
    const summary = buildSharedSummary(input(NO_SHARING));
    // Absent, not null: unshared data is never written to a readable place.
    expect('calories' in summary).toBe(false);
    expect('weight' in summary).toBe(false);
    expect('workouts' in summary).toBe(false);
    expect('rules' in summary).toBe(false);
    expect('photos' in summary).toBe(false);
  });

  it('includes only the sections that are switched on', () => {
    const summary = buildSharedSummary(input({ ...NO_SHARING, stats: true }));
    // Stats is one decision covering both numbers, so both arrive together.
    expect(summary.calories).toBeDefined();
    expect(summary.weight).toBeDefined();
    // The achievements are a separate decision, and were not made.
    expect('workouts' in summary).toBe(false);
    expect('rules' in summary).toBe(false);
    expect('photos' in summary).toBe(false);
  });

  it('shares calorie averages and the deficit', () => {
    const summary = buildSharedSummary(input(allOn));
    expect(summary.calories).toEqual({
      avgIntake: 1900,
      target: 2000,
      daysLogged: 5,
      deficit: 500,
    });
  });

  it('shares a weight change, never an absolute weight', () => {
    const summary = buildSharedSummary(input(allOn));
    expect(summary.weight?.changeKg).toBeLessThan(0);
    // The actual number on the scale must not appear anywhere.
    expect(JSON.stringify(summary)).not.toContain('80');
  });

  it('omits weight entirely when nothing has been weighed', () => {
    const noWeights = days.map(({ weightKg: _ignored, ...day }) => day);
    const summary = buildSharedSummary({ ...input(allOn), days: noWeights });
    expect('weight' in summary).toBe(false);
  });

  it('shares the top three lifts, heaviest first', () => {
    const summary = buildSharedSummary(input(allOn));
    expect(summary.workouts?.topLifts[0].name).toBe('Back squat');
    expect(summary.workouts?.topLifts).toHaveLength(2);
    expect(summary.workouts?.lastDate).toBe('2026-03-05');
  });

  it('shares rules with their streaks', () => {
    const summary = buildSharedSummary(input(allOn));
    expect(summary.rules?.[0].name).toBe('No weekday drinking');
    expect(summary.rules?.[0].streak).toBeGreaterThan(0);
  });

  it('leaves paused rules out', () => {
    const paused = [{ ...rules[0], active: false }];
    const summary = buildSharedSummary({ ...input(allOn), rules: paused });
    expect(summary.rules).toEqual([]);
  });

  it('shares photo thumbnails only', () => {
    const summary = buildSharedSummary(input(allOn));
    expect(summary.photos).toHaveLength(1);
    expect(summary.photos?.[0]).toHaveProperty('thumbUrl');
    // Full-size images are never put into a group-readable document.
    expect(JSON.stringify(summary.photos)).not.toContain('full');
  });

  it('caps how many photos are shared', () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      week: `2026-W${String(index + 1).padStart(2, '0')}`,
      thumbUrl: 'https://example.test/t.jpg',
    }));
    const summary = buildSharedSummary({ ...input(allOn), photos: many });
    expect(summary.photos!.length).toBeLessThanOrEqual(8);
  });

  it('turning a flag off removes every section it covered', () => {
    const on = buildSharedSummary(input(allOn));
    expect(on.calories).toBeDefined();
    expect(on.weight).toBeDefined();

    // Stats is one decision covering both numbers, so both go together.
    const off = buildSharedSummary(input({ ...allOn, stats: false }));
    expect('calories' in off).toBe(false);
    expect('weight' in off).toBe(false);
    // And the achievements, which are a different decision, stay.
    expect(off.rules).toBeDefined();
    expect(off.workouts).toBeDefined();
  });

  it('turning goals off removes the achievements and leaves the numbers', () => {
    const off = buildSharedSummary(input({ ...allOn, goals: false }));
    expect('rules' in off).toBe(false);
    expect('workouts' in off).toBe(false);
    expect(off.calories).toBeDefined();
  });
});

describe('migrating the old share flags', () => {
  it('folds a flag per section into the three', () => {
    // Somebody who shared their weight but not their calories was sharing a
    // number either way, so stats comes on rather than their choice resetting.
    expect(migrateShareFlags({ calories: false, weight: true, rules: false, photos: false }))
      .toEqual({ stats: true, goals: false, photos: false, activity: true });

    expect(migrateShareFlags({ calories: false, weight: false, rules: true, workouts: false }))
      .toEqual({ stats: false, goals: true, photos: false, activity: true });
  });

  it('keeps photos, which did not change meaning', () => {
    expect(migrateShareFlags({ photos: true }).photos).toBe(true);
  });

  it('turns nothing on for somebody who shared nothing', () => {
    const migrated = migrateShareFlags({
      calories: false, weight: false, workouts: false, rules: false, photos: false,
    });
    expect(migrated).toEqual({
      stats: false, goals: false, photos: false, activity: true,
    });
  });

  it('leaves a record that is already the new shape alone', () => {
    const current = { stats: true, goals: false, photos: true, activity: false };
    expect(migrateShareFlags(current)).toEqual(current);
  });

  it('copes with a record that has no flags at all', () => {
    expect(migrateShareFlags(undefined)).toEqual({
      stats: false, goals: false, photos: false, activity: true,
    });
    expect(migrateShareFlags({})).toEqual({
      stats: false, goals: false, photos: false, activity: true,
    });
  });

  it('never reads a stray value as a yes', () => {
    const odd = { stats: 'yes', goals: 1 } as unknown;
    expect(migrateShareFlags(odd)).toEqual({
      stats: false, goals: false, photos: false, activity: true,
    });
  });
});

describe('share metadata', () => {
  it('has a label and description for every key', () => {
    for (const key of SHARE_KEYS) {
      expect(SHARE_LABELS[key]).toBeTruthy();
      expect(SHARE_DESCRIPTIONS[key]).toBeTruthy();
    }
  });

  it('defaults every key to not shared', () => {
    for (const key of SHARE_KEYS) {
      expect(NO_SHARING[key]).toBe(false);
    }
  });
});

describe('what a new member starts with', () => {
  it('asks about exactly three things before letting somebody in', () => {
    expect(JOIN_SHARE_KEYS).toEqual(['stats', 'goals', 'photos']);
  });

  it('shares nothing substantive until they say so', () => {
    for (const key of JOIN_SHARE_KEYS) {
      expect(DEFAULT_SHARING[key]).toBe(false);
    }
  });

  it('does let the group see a gap in logging, which is the point of a group', () => {
    // It carries no data, only the fact that a gap exists, and the sharing
    // screen says so. A group that cannot see a gap cannot nudge anyone.
    expect(DEFAULT_SHARING.activity).toBe(true);
    expect(NO_SHARING.activity).toBe(false);
  });
});

describe('inactivity', () => {
  it('counts the days since the last log', () => {
    expect(daysInactive('2026-03-06', '2026-03-09')).toBe(3);
    expect(daysInactive('2026-03-09', '2026-03-09')).toBe(0);
  });

  it('says nothing about someone who has never logged', () => {
    expect(daysInactive(undefined, '2026-03-09')).toBe(0);
    expect(isInactive(undefined, '2026-03-09')).toBe(false);
  });

  it('starts mentioning it at three days, not before', () => {
    expect(INACTIVE_AFTER_DAYS).toBe(3);
    expect(isInactive('2026-03-07', '2026-03-09')).toBe(false);
    expect(isInactive('2026-03-06', '2026-03-09')).toBe(true);
  });

  it('never reports a negative gap from a future date', () => {
    expect(daysInactive('2026-03-10', '2026-03-09')).toBe(0);
  });
});

describe('the last logged day', () => {
  it('is shared only when the activity flag is on', () => {
    expect(buildSharedSummary(input(allOn)).lastLoggedDay).toBe('2026-03-06');
    expect(buildSharedSummary(input(NO_SHARING)).lastLoggedDay).toBeUndefined();
  });

  it('is the last day with food on it, not merely the last day in range', () => {
    const withGap = input({ ...NO_SHARING, activity: true });
    withGap.days = [
      ...days.slice(0, 3),
      { date: '2026-03-05', calories: 0, entries: [] },
      { date: '2026-03-06', calories: 0, entries: [] },
    ];
    expect(buildSharedSummary(withGap).lastLoggedDay).toBe('2026-03-04');
  });

  it('is absent for a member who has logged nothing at all', () => {
    const blank = input({ ...NO_SHARING, activity: true });
    blank.days = days.map((day) => ({ ...day, calories: 0 }));
    expect(buildSharedSummary(blank).lastLoggedDay).toBeUndefined();
  });
});

describe('the weekly deficit across a goal change', () => {
  // The week runs Mon 2026-03-02 to Fri 2026-03-06, five days at 1,900.
  const history: GoalPeriod[] = [
    { startDate: '2026-01-01', goal: 'lose', targetRateKgPerWeek: 0.45, calorieTarget: 2000 },
    { startDate: '2026-03-05', goal: 'gain', targetRateKgPerWeek: 0.2, calorieTarget: 2600 },
  ];

  it('scores each day against the goal that was active on it', () => {
    const shared = buildSharedSummary({ ...input({ ...NO_SHARING, stats: true }), goalHistory: history });

    // Three days on a 2,000 target and two on 2,600 blends to 2,240, so five
    // days at 1,900 sit 1,700 under. Against today's 2,000 alone it would
    // have read 500, flattering a week the member spent mostly losing.
    expect(shared.calories?.deficit).toBe(1700);
  });

  it('still shows today’s target, which is the number that means something', () => {
    const shared = buildSharedSummary({ ...input({ ...NO_SHARING, stats: true }), goalHistory: history });
    expect(shared.calories?.target).toBe(2000);
  });

  it('is unchanged for a member who has never changed goals', () => {
    const plain = buildSharedSummary(input({ ...NO_SHARING, stats: true }));
    const empty = buildSharedSummary({ ...input({ ...NO_SHARING, stats: true }), goalHistory: [] });
    expect(plain.calories).toEqual(empty.calories);
    // Five days at 1,900 against a flat 2,000 target.
    expect(plain.calories?.deficit).toBe(500);
  });
});
