import { describe, it, expect } from 'vitest';
import {
  appendGoalPeriod, blendedTarget, describeAverage, goalChangeIndices, goalOn,
  goalsDiffer, recordGoalChange, sortGoals, GOAL_WORDS,
} from './goals';
import type { GoalPeriod } from './types';

const losing: GoalPeriod = {
  startDate: '2026-01-01',
  goal: 'lose',
  targetRateKgPerWeek: 0.45,
  calorieTarget: 2000,
};

const gaining: GoalPeriod = {
  startDate: '2026-03-15',
  goal: 'gain',
  targetRateKgPerWeek: 0.25,
  calorieTarget: 2800,
};

const history = [losing, gaining];

describe('goalOn', () => {
  it('finds the goal active on a day', () => {
    expect(goalOn(history, '2026-02-10')?.goal).toBe('lose');
    expect(goalOn(history, '2026-04-10')?.goal).toBe('gain');
  });

  it('counts the start day itself as the new goal', () => {
    expect(goalOn(history, '2026-03-15')?.goal).toBe('gain');
    expect(goalOn(history, '2026-03-14')?.goal).toBe('lose');
  });

  it('uses the earliest goal for anything before the history starts', () => {
    // The whole point: an old deficit day must not be scored against a goal
    // the user only took up later.
    expect(goalOn(history, '2025-06-01')?.goal).toBe('lose');
  });

  it('says nothing when there is no history', () => {
    expect(goalOn([], '2026-03-01')).toBeNull();
  });

  it('does not care what order the entries arrive in', () => {
    expect(goalOn([gaining, losing], '2026-02-10')?.goal).toBe('lose');
  });
});

describe('sortGoals', () => {
  it('returns oldest first without mutating the input', () => {
    const input = [gaining, losing];
    expect(sortGoals(input).map((period) => period.goal)).toEqual(['lose', 'gain']);
    expect(input[0]).toBe(gaining);
  });
});

describe('targets across a goal change', () => {
  it('blends the per-day targets across the days handed in', () => {
    // Two days on the old 2,000 target, two on the new 2,800.
    const dates = ['2026-03-13', '2026-03-14', '2026-03-15', '2026-03-16'];
    expect(blendedTarget(dates, history, 0)).toBe(2400);
  });

  it('is just the target when no change falls inside the span', () => {
    expect(blendedTarget(['2026-04-01', '2026-04-02'], history, 0)).toBe(2800);
  });

  it('falls back to the profile target with no history', () => {
    expect(blendedTarget(['2026-04-01'], [], 2200)).toBe(2200);
    expect(blendedTarget([], history, 2200)).toBe(2200);
  });
});

describe('goalChangeIndices', () => {
  const week = [
    '2026-03-12', '2026-03-13', '2026-03-14', '2026-03-15',
    '2026-03-16', '2026-03-17', '2026-03-18',
  ];

  it('marks the bucket the change starts in', () => {
    expect(goalChangeIndices(week, history)).toEqual([3]);
  });

  it('never marks the first goal, which is where history begins', () => {
    expect(goalChangeIndices(week, [losing])).toEqual([]);
    expect(goalChangeIndices(week, [])).toEqual([]);
  });

  it('ignores a change from before the window', () => {
    expect(goalChangeIndices(['2026-04-01', '2026-04-02'], history)).toEqual([]);
  });

  it('marks the week a mid-week change lands in', () => {
    // The year view buckets by Monday, so a Sunday change marks its week.
    const mondays = ['2026-03-02', '2026-03-09', '2026-03-16'];
    expect(goalChangeIndices(mondays, history)).toEqual([1]);
  });

  it('returns one index per bucket even with two changes in it', () => {
    const third: GoalPeriod = { ...gaining, startDate: '2026-03-16', goal: 'maintain' };
    const all = [losing, gaining, third];
    expect(goalChangeIndices(['2026-03-02', '2026-03-09', '2026-03-16'], all)).toEqual([1, 2]);
    expect(goalChangeIndices(['2026-03-09'], all)).toEqual([0]);
  });
});

describe('appendGoalPeriod', () => {
  it('adds a new entry in date order', () => {
    const next: GoalPeriod = { ...gaining, startDate: '2026-06-01', goal: 'maintain' };
    expect(appendGoalPeriod(history, next).map((period) => period.goal))
      .toEqual(['lose', 'gain', 'maintain']);
  });

  it('replaces an entry that already starts that day', () => {
    const rethink: GoalPeriod = { ...gaining, goal: 'maintain' };
    const after = appendGoalPeriod(history, rethink);
    expect(after).toHaveLength(2);
    expect(after[1].goal).toBe('maintain');
  });

  it('leaves the original array alone', () => {
    appendGoalPeriod(history, { ...gaining, startDate: '2026-06-01' });
    expect(history).toHaveLength(2);
  });
});

describe('recordGoalChange', () => {
  const next: GoalPeriod = {
    startDate: '2026-11-09',
    goal: 'gain',
    targetRateKgPerWeek: 0.2,
    calorieTarget: 2900,
  };

  it('writes down the goal being left when there is no history yet', () => {
    const saved = recordGoalChange({ history: [], previous: losing, next });
    expect(saved).toHaveLength(2);
    expect(saved[0].goal).toBe('lose');
    expect(saved[1].goal).toBe('gain');
    // And the days already logged still resolve to the old goal.
    expect(goalOn(saved, '2026-05-01')?.calorieTarget).toBe(2000);
  });

  it('does not seed again once there is history', () => {
    const saved = recordGoalChange({ history, previous: losing, next });
    expect(saved).toHaveLength(3);
  });
});

describe('goalsDiffer', () => {
  const current = { goal: 'lose' as const, targetRateKgPerWeek: 0.45, calorieTarget: 2000 };

  it('spots a different goal, rate or target', () => {
    expect(goalsDiffer(current, { ...current, goal: 'gain' })).toBe(true);
    expect(goalsDiffer(current, { ...current, targetRateKgPerWeek: 0.9 })).toBe(true);
    expect(goalsDiffer(current, { ...current, calorieTarget: 2100 })).toBe(true);
  });

  it('ignores a rate that only differs by floating-point dust', () => {
    expect(goalsDiffer(current, { ...current, targetRateKgPerWeek: 0.45 + 1e-9 })).toBe(false);
  });
});

describe('the words each goal uses', () => {
  it('names the gap and the side of maintenance for each goal', () => {
    expect(GOAL_WORDS.lose.gap).toBe('deficit');
    expect(GOAL_WORDS.gain.gap).toBe('surplus');
    expect(GOAL_WORDS.lose.side).toBe('below');
    expect(GOAL_WORDS.gain.side).toBe('above');
  });

  it('only ever tells someone gaining to eat more', () => {
    expect(GOAL_WORDS.gain.fix).toBe('eat-more');
    expect(GOAL_WORDS.lose.fix).toBe('eat-less');
    expect(GOAL_WORDS.maintain.fix).toBe('eat-less');
  });
});

describe('describeAverage', () => {
  it('reads a positive figure as below maintenance', () => {
    expect(describeAverage(250)).toBe('250 below maintenance');
  });

  it('reads a negative figure as above maintenance', () => {
    expect(describeAverage(-250)).toBe('250 above maintenance');
  });

  it('has a phrase for sitting on the line', () => {
    expect(describeAverage(0)).toBe('right at maintenance');
    expect(describeAverage(0.4)).toBe('right at maintenance');
  });

  it('groups thousands, as every other number in the app does', () => {
    expect(describeAverage(1250)).toBe('1,250 below maintenance');
  });
});
