import { describe, it, expect } from 'vitest';
import { canLogSet, isNewBest, summarizeWorkout, BEST_MARGIN_KG } from './workout';
import { estimateOneRepMax, type WorkoutSet } from './strength';

const set = (weightKg: number, reps: number): WorkoutSet => ({ weightKg, reps });

describe('canLogSet', () => {
  it('needs a weight', () => {
    expect(canLogSet(null, 8)).toBe(false);
  });

  it('needs reps', () => {
    expect(canLogSet(100, null)).toBe(false);
  });

  it('accepts bodyweight as zero', () => {
    expect(canLogSet(0, 8)).toBe(true);
  });

  it('rejects a negative weight', () => {
    expect(canLogSet(-5, 8)).toBe(false);
  });

  it('rejects zero reps', () => {
    expect(canLogSet(100, 0)).toBe(false);
  });

  it('rejects values that are not numbers', () => {
    expect(canLogSet(Number.NaN, 8)).toBe(false);
    expect(canLogSet(100, Number.NaN)).toBe(false);
  });

  it('accepts a complete set', () => {
    expect(canLogSet(100, 8)).toBe(true);
  });
});

describe('isNewBest', () => {
  it('beats a lower previous best', () => {
    expect(isNewBest(100, 8, 110)).toBe(true); // e1RM ~126.7
  });

  it('does not beat a higher previous best', () => {
    expect(isNewBest(100, 8, 140)).toBe(false);
  });

  it('counts more reps at the same weight as a best', () => {
    const eight = estimateOneRepMax(100, 8);
    expect(isNewBest(100, 9, eight)).toBe(true);
  });

  it('counts more weight at the same reps as a best', () => {
    const hundred = estimateOneRepMax(100, 8);
    expect(isNewBest(102.5, 8, hundred)).toBe(true);
  });

  it('ignores a difference inside the rounding margin', () => {
    const e1rm = estimateOneRepMax(100, 8);
    expect(isNewBest(100, 8, e1rm - BEST_MARGIN_KG / 2)).toBe(false);
  });

  it('is never a best from an incomplete set', () => {
    expect(isNewBest(100, 0, 0)).toBe(false);
  });

  it('makes the very first set a best', () => {
    expect(isNewBest(60, 5, 0)).toBe(true);
  });
});

describe('summarizeWorkout', () => {
  const squat = {
    exerciseId: 'squat',
    name: 'Squat',
    sets: [set(100, 8), set(100, 8), set(105, 6)],
    previousBestKg: 120,
  };

  it('counts sets and exercises', () => {
    const summary = summarizeWorkout([squat]);
    expect(summary.setsDone).toBe(3);
    expect(summary.exercisesDone).toBe(1);
  });

  it('ignores an exercise with nothing logged', () => {
    const summary = summarizeWorkout([
      squat,
      { exerciseId: 'row', name: 'Row', sets: [], previousBestKg: 0 },
    ]);
    expect(summary.exercisesDone).toBe(1);
    expect(summary.setsDone).toBe(3);
  });

  it('totals the volume moved', () => {
    expect(summarizeWorkout([squat]).totalVolumeKg).toBe(100 * 8 + 100 * 8 + 105 * 6);
  });

  it('names a new best', () => {
    const summary = summarizeWorkout([squat]);
    expect(summary.newBests).toHaveLength(1);
    expect(summary.newBests[0].name).toBe('Squat');
    expect(summary.newBests[0].previousKg).toBe(120);
  });

  it('reports no best when the previous one stands', () => {
    const summary = summarizeWorkout([{ ...squat, previousBestKg: 200 }]);
    expect(summary.newBests).toEqual([]);
  });

  it('puts the biggest jump first', () => {
    const summary = summarizeWorkout([
      { exerciseId: 'a', name: 'Small', sets: [set(100, 8)], previousBestKg: 126 },
      { exerciseId: 'b', name: 'Big', sets: [set(100, 8)], previousBestKg: 50 },
    ]);
    expect(summary.newBests.map((best) => best.name)).toEqual(['Big', 'Small']);
  });

  it('says nothing about an empty workout', () => {
    expect(summarizeWorkout([])).toEqual({
      setsDone: 0,
      exercisesDone: 0,
      totalVolumeKg: 0,
      newBests: [],
    });
  });
});
