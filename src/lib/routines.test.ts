import { describe, it, expect } from 'vitest';
import {
  sortRoutines, nextDueRoutine, plannedSetCount,
  clampSets, MAX_SETS,
} from './routines';
import type { Routine, RoutineExercise } from './types';

const slot = (name: string, sets = 3): RoutineExercise => ({
  exerciseId: name.toLowerCase(),
  name,
  sets,
});

const routine = (
  id: string,
  order: number,
  lastDoneDate?: string,
): Routine => ({ id, name: `Day ${order + 1}`, order, exercises: [], lastDoneDate });

describe('sortRoutines', () => {
  it('orders by the arranged position', () => {
    const sorted = sortRoutines([routine('c', 2), routine('a', 0), routine('b', 1)]);
    expect(sorted.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate its input', () => {
    const input = [routine('c', 2), routine('a', 0)];
    sortRoutines(input);
    expect(input[0].id).toBe('c');
  });
});

describe('nextDueRoutine', () => {
  it('has nothing to suggest without routines', () => {
    expect(nextDueRoutine([])).toBeNull();
  });

  it('starts at the first day when nothing has been done', () => {
    expect(nextDueRoutine([routine('b', 1), routine('a', 0)])?.id).toBe('a');
  });

  it('prefers a day that has never been done', () => {
    const due = nextDueRoutine([
      routine('a', 0, '2026-03-02'),
      routine('b', 1),
      routine('c', 2, '2026-03-04'),
    ]);
    expect(due?.id).toBe('b');
  });

  it('steps past the day done most recently', () => {
    const due = nextDueRoutine([
      routine('a', 0, '2026-03-02'),
      routine('b', 1, '2026-03-04'),
      routine('c', 2, '2026-03-03'),
    ]);
    expect(due?.id).toBe('c');
  });

  it('wraps round to the first day after the last one', () => {
    const due = nextDueRoutine([
      routine('a', 0, '2026-03-02'),
      routine('b', 1, '2026-03-03'),
      routine('c', 2, '2026-03-04'),
    ]);
    expect(due?.id).toBe('a');
  });

  it('repeats the only day there is', () => {
    expect(nextDueRoutine([routine('a', 0, '2026-03-04')])?.id).toBe('a');
  });
});

describe('plannedSetCount', () => {
  it('adds the planned sets up', () => {
    expect(plannedSetCount([slot('Squat', 4), slot('Lunge', 3)])).toBe(7);
  });

  it('is zero for an empty day', () => {
    expect(plannedSetCount([])).toBe(0);
  });
});

describe('clamping typed set counts', () => {
  it('never allows zero sets', () => {
    expect(clampSets(0)).toBe(1);
  });

  it('caps absurd input', () => {
    expect(clampSets(500)).toBe(MAX_SETS);
  });

  it('rounds a fractional entry', () => {
    expect(clampSets(3.6)).toBe(4);
  });

  it('falls back to one for nonsense', () => {
    expect(clampSets(Number.NaN)).toBe(1);
  });
});
