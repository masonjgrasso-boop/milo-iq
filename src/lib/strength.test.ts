import { describe, it, expect } from 'vitest';
import {
  estimateOneRepMax, tryEstimateOneRepMax, bestSetE1rm, sessionBests, sessionVolume,
  STARTER_EXERCISES, type WorkoutSet,
} from './strength';

const set = (weightKg: number, reps: number): WorkoutSet => ({ weightKg, reps });

describe('estimateOneRepMax', () => {
  it('returns the weight itself for a single rep', () => {
    expect(estimateOneRepMax(100, 1)).toBeCloseTo(100 * (1 + 1 / 30), 10);
  });

  it('matches the Epley formula', () => {
    // 100kg x 5 = 100 * (1 + 5/30) = 116.67
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.667, 3);
    expect(estimateOneRepMax(60, 10)).toBeCloseTo(80, 10);
  });

  it('rises with more weight at the same reps', () => {
    expect(estimateOneRepMax(105, 5)).toBeGreaterThan(estimateOneRepMax(100, 5));
  });

  it('rises with more reps at the same weight', () => {
    // The whole point: more reps counts as progress too.
    expect(estimateOneRepMax(100, 8)).toBeGreaterThan(estimateOneRepMax(100, 5));
  });

  it('treats added reps and added weight as comparable progress', () => {
    // 100x5 and 110x2 are roughly equivalent efforts, so their estimates
    // should land within a couple of percent of each other rather than
    // ranking one far above the other.
    const reps = estimateOneRepMax(100, 5);
    const weight = estimateOneRepMax(110, 2);
    expect(Math.abs(reps - weight) / weight).toBeLessThan(0.02);
  });

  it('rejects impossible rep counts', () => {
    expect(() => estimateOneRepMax(100, 0)).toThrow(RangeError);
    expect(() => estimateOneRepMax(100, -3)).toThrow(RangeError);
    expect(() => estimateOneRepMax(100, Number.NaN)).toThrow(RangeError);
  });

  it('rejects a negative weight', () => {
    expect(() => estimateOneRepMax(-100, 5)).toThrow(RangeError);
  });

  it('allows a zero weight for bodyweight work', () => {
    expect(estimateOneRepMax(0, 10)).toBe(0);
  });
});

describe('tryEstimateOneRepMax', () => {
  it('returns null instead of throwing on bad input', () => {
    expect(tryEstimateOneRepMax(100, 0)).toBeNull();
    expect(tryEstimateOneRepMax(Number.NaN, 5)).toBeNull();
  });

  it('returns the estimate on good input', () => {
    expect(tryEstimateOneRepMax(60, 10)).toBeCloseTo(80, 10);
  });
});

describe('bestSetE1rm', () => {
  it('takes the best set, not the last or the average', () => {
    const sets = [set(100, 5), set(60, 10), set(60, 8)];
    expect(bestSetE1rm(sets)).toBeCloseTo(estimateOneRepMax(100, 5), 10);
  });

  it('is not dragged down by back-off sets', () => {
    const topOnly = bestSetE1rm([set(100, 5)]);
    const withBackoffs = bestSetE1rm([set(100, 5), set(70, 8), set(70, 8)]);
    expect(withBackoffs).toBe(topOnly);
  });

  it('ignores sets with no reps', () => {
    expect(bestSetE1rm([set(100, 0), set(60, 10)])).toBeCloseTo(80, 10);
  });

  it('returns zero when there are no usable sets', () => {
    expect(bestSetE1rm([])).toBe(0);
    expect(bestSetE1rm([set(100, 0)])).toBe(0);
  });
});

describe('sessionBests', () => {
  it('returns one point per session, oldest first', () => {
    const points = sessionBests([
      { date: '2026-03-10', sets: [set(105, 5)] },
      { date: '2026-03-03', sets: [set(100, 5)] },
    ]);
    expect(points.map((point) => point.date)).toEqual(['2026-03-03', '2026-03-10']);
    expect(points[1].e1rmKg).toBeGreaterThan(points[0].e1rmKg);
  });

  it('shows added reps at the same weight as progress', () => {
    const points = sessionBests([
      { date: '2026-03-03', sets: [set(100, 5)] },
      { date: '2026-03-10', sets: [set(100, 8)] },
    ]);
    expect(points[1].e1rmKg).toBeGreaterThan(points[0].e1rmKg);
  });

  it('drops sessions with nothing usable logged', () => {
    const points = sessionBests([
      { date: '2026-03-03', sets: [] },
      { date: '2026-03-10', sets: [set(100, 5)] },
    ]);
    expect(points).toHaveLength(1);
  });

  it('returns an empty list for no sessions', () => {
    expect(sessionBests([])).toEqual([]);
  });
});

describe('sessionVolume', () => {
  it('totals weight times reps across sets', () => {
    expect(sessionVolume([set(100, 5), set(60, 10)])).toBe(1100);
  });

  it('is zero for no sets', () => {
    expect(sessionVolume([])).toBe(0);
  });
});

describe('STARTER_EXERCISES', () => {
  it('covers the main lifts', () => {
    expect(STARTER_EXERCISES).toContain('Back squat');
    expect(STARTER_EXERCISES).toContain('Bench press');
    expect(STARTER_EXERCISES).toContain('Deadlift');
  });

  it('has no duplicates', () => {
    expect(new Set(STARTER_EXERCISES).size).toBe(STARTER_EXERCISES.length);
  });
});
