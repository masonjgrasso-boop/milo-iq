import { describe, it, expect } from 'vitest';
import {
  generateInviteCode, normalizeInviteCode, isValidInviteCode, INVITE_CODE_LENGTH,
  buildSharedSummary, NO_SHARING, SHARE_KEYS, SHARE_LABELS, SHARE_DESCRIPTIONS,
  type ShareFlags, type ShareInput,
} from './groups';
import { rangeKeys } from './dates';
import type { DayLog, Exercise, Rule } from './types';

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

const allOn: ShareFlags = {
  calories: true, weight: true, workouts: true, rules: true, photos: true,
};

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
    const summary = buildSharedSummary(input({ ...NO_SHARING, calories: true }));
    expect(summary.calories).toBeDefined();
    expect('weight' in summary).toBe(false);
    expect('workouts' in summary).toBe(false);
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

  it('turning a flag off removes that section from the rebuilt mirror', () => {
    const on = buildSharedSummary(input(allOn));
    expect(on.calories).toBeDefined();
    const off = buildSharedSummary(input({ ...allOn, calories: false }));
    expect('calories' in off).toBe(false);
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
