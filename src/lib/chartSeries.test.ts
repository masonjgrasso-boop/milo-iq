import { describe, it, expect } from 'vitest';
import {
  goalOffset, goalPaceSeries, goalSeries, intakeSeries, maintenanceSeries,
  measureMaintenance, standing, standingLine, signedCalories,
  type IntakeBucket,
} from './chartSeries';
import { estimateMaintenance, MAX_WINDOW_DAYS } from './maintenance';
import { paceFromTotals } from './pace';
import { addDays } from './dates';
import { dailyCalorieDelta } from './targets';
import type { DayLog, GoalPeriod } from './types';

const START = '2026-03-02';

/** Day buckets from a run of intakes, with a weigh-in every `everyNth` day. */
function dayBuckets(
  intakes: number[],
  weights: (number | null)[] = [],
): IntakeBucket[] {
  return intakes.map((calories, index) => ({
    date: addDays(START, index),
    totalCalories: calories,
    daysLogged: calories > 0 ? 1 : 0,
    weightKg: weights[index] ?? null,
  }));
}

/** The same thing as day logs, for comparing against estimateMaintenance. */
function dayLogs(buckets: IntakeBucket[]): DayLog[] {
  return buckets.map((bucket) => ({
    date: bucket.date,
    calories: bucket.totalCalories,
    entries: [],
    ...(bucket.weightKg === null ? {} : { weightKg: bucket.weightKg }),
  }));
}

describe('measureMaintenance', () => {
  it('reads maintenance as intake plus whatever the body supplied', () => {
    // 20 days eating 2,000 while the trend falls 1 kg over 19 days. That kilo
    // is 7,700 calories the body put in, about 405 a day.
    const weights = Array.from({ length: 20 }, (_, i) => 80 - i * (1 / 19));
    const buckets = dayBuckets(Array(20).fill(2000), weights);

    const measured = measureMaintenance(buckets) as number;
    expect(measured).toBeGreaterThan(2000);
    expect(measured).toBeLessThan(2500);
  });

  it('says nothing before there are enough logged days', () => {
    const weights = Array.from({ length: 13 }, () => 80);
    expect(measureMaintenance(dayBuckets(Array(13).fill(2000), weights))).toBeNull();
  });

  it('says nothing without enough weigh-ins', () => {
    const weights = Array.from({ length: 20 }, (_, i) => (i < 2 ? 80 : null));
    expect(measureMaintenance(dayBuckets(Array(20).fill(2000), weights))).toBeNull();
  });

  it('says nothing when the weigh-ins are too close together to show a trend', () => {
    const weights = Array.from({ length: 20 }, (_, i) => (i < 3 ? 80 : null));
    expect(measureMaintenance(dayBuckets(Array(20).fill(2000), weights))).toBeNull();
  });

  it('agrees with estimateMaintenance on day-sized buckets', () => {
    // The guard against two copies of this formula drifting apart.
    const weights = Array.from({ length: 24 }, (_, i) => (i % 3 === 0 ? 80 - i * 0.03 : null));
    const buckets = dayBuckets(
      Array.from({ length: 24 }, (_, i) => 2000 + (i % 5) * 50),
      weights,
    );

    const mine = measureMaintenance(buckets);
    const theirs = estimateMaintenance(dayLogs(buckets), buckets[buckets.length - 1].date);

    expect(theirs.status).toBe('ready');
    expect(mine).toBe(
      theirs.status === 'ready' ? theirs.maintenanceCalories : null,
    );
  });

  it('counts a week bucket as seven days, not one', () => {
    // Three weekly buckets: 21 logged days, which clears the 14-day minimum
    // that three single days never would.
    const weekly: IntakeBucket[] = [0, 1, 2].map((i) => ({
      date: addDays(START, i * 7),
      totalCalories: 2000 * 7,
      daysLogged: 7,
      weightKg: 80 - i * 0.3,
    }));
    expect(measureMaintenance(weekly)).not.toBeNull();
  });
});

describe('maintenanceSeries', () => {
  const weights = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 80 - i * 0.02 : null));
  const buckets = dayBuckets(Array(30).fill(2200), weights);
  const series = maintenanceSeries(buckets, MAX_WINDOW_DAYS, 2500);

  it('gives one point per bucket', () => {
    expect(series).toHaveLength(30);
  });

  it('uses the starting estimate until there is enough history, and says so', () => {
    expect(series[0]).toEqual({ calories: 2500, measured: false });
    expect(series[5].measured).toBe(false);
  });

  it('switches to a measurement once the window holds enough', () => {
    const last = series[series.length - 1];
    expect(last.measured).toBe(true);
    expect(last.calories).not.toBe(2500);
  });

  it('ends on the same figure the app measures today', () => {
    // The right-hand end of the line and the headline have to agree.
    const today = buckets[buckets.length - 1].date;
    const result = estimateMaintenance(dayLogs(buckets), today);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(series[series.length - 1].calories).toBe(result.maintenanceCalories);
    }
  });

  it('only looks back as far as the window', () => {
    // A huge intake 40 days ago must not move today's point.
    const long = dayBuckets(
      [8000, ...Array(39).fill(2200)],
      Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 80 - i * 0.02 : null)),
    );
    const windowed = maintenanceSeries(long, MAX_WINDOW_DAYS, 2500);
    const plain = maintenanceSeries(long.slice(1), MAX_WINDOW_DAYS, 2500);
    expect(windowed[windowed.length - 1].calories).toBe(plain[plain.length - 1].calories);
  });
});

describe('goalOffset', () => {
  it('puts a gain goal above maintenance and a lose goal below', () => {
    expect(goalOffset({ goal: 'gain', targetRateKgPerWeek: 0.45 }))
      .toBe(Math.round(dailyCalorieDelta(0.45)));
    expect(goalOffset({ goal: 'lose', targetRateKgPerWeek: 0.45 }))
      .toBe(-Math.round(dailyCalorieDelta(0.45)));
  });

  it('is zero when maintaining, whatever rate is stored', () => {
    expect(goalOffset({ goal: 'maintain', targetRateKgPerWeek: 0.9 })).toBe(0);
  });
});

describe('goalSeries', () => {
  const buckets = dayBuckets(Array(10).fill(2000));
  const maintenance = buckets.map(() => ({ calories: 2500, measured: true }));

  const history: GoalPeriod[] = [
    { startDate: START, goal: 'lose', targetRateKgPerWeek: 0.45, calorieTarget: 2000 },
    { startDate: addDays(START, 5), goal: 'gain', targetRateKgPerWeek: 0.45, calorieTarget: 3000 },
  ];

  it('tracks maintenance at a fixed distance', () => {
    const line = goalSeries(buckets, maintenance, history, { goal: 'lose', targetRateKgPerWeek: 0.45 });
    const delta = Math.round(dailyCalorieDelta(0.45));
    expect(line[0]).toBe(2500 - delta);
  });

  it('steps on the day the goal changed', () => {
    const line = goalSeries(buckets, maintenance, history, { goal: 'lose', targetRateKgPerWeek: 0.45 });
    expect(line[4]).toBeLessThan(2500);
    expect(line[5]).toBeGreaterThan(2500);
  });

  it('rides a moving maintenance line rather than sitting flat', () => {
    const rising = buckets.map((_, i) => ({ calories: 2500 + i * 10, measured: true }));
    const line = goalSeries(buckets, rising, [], { goal: 'lose', targetRateKgPerWeek: 0.45 });
    expect(line[9] - line[0]).toBe(90);
  });

  it('falls back to the profile when a date predates all history', () => {
    const later: GoalPeriod[] = [
      { startDate: '2027-01-01', goal: 'gain', targetRateKgPerWeek: 0.2, calorieTarget: 3000 },
    ];
    // goalOn clamps to the earliest entry, so this is that entry, not the
    // fallback — the fallback only applies when there is no history at all.
    const line = goalSeries(buckets, maintenance, later, { goal: 'lose', targetRateKgPerWeek: 0.45 });
    expect(line[0]).toBeGreaterThan(2500);

    const none = goalSeries(buckets, maintenance, [], { goal: 'lose', targetRateKgPerWeek: 0.45 });
    expect(none[0]).toBeLessThan(2500);
  });
});

describe('intakeSeries', () => {
  it('averages the trailing seven days', () => {
    // Seven days at 2,000 then seven at 3,000.
    const buckets = dayBuckets([...Array(7).fill(2000), ...Array(7).fill(3000)]);
    const line = intakeSeries(buckets, 7);
    expect(line[6]).toBe(2000);
    expect(line[13]).toBe(3000);
    // Half way through the second week it is the mix of both.
    expect(line[9]).toBe(Math.round((2000 * 4 + 3000 * 3) / 7));
  });

  it('skips unlogged days rather than counting them as zero', () => {
    const buckets = dayBuckets([2000, 0, 2000]);
    expect(intakeSeries(buckets, 7)[2]).toBe(2000);
  });

  it('is null while the window holds nothing', () => {
    expect(intakeSeries(dayBuckets([0, 0]), 7)[1]).toBeNull();
  });

  it('gives a week bucket its own average, since that is already seven days', () => {
    const weekly: IntakeBucket[] = [0, 1].map((i) => ({
      date: addDays(START, i * 7),
      totalCalories: i === 0 ? 14_000 : 21_000,
      daysLogged: 7,
      weightKg: null,
    }));
    const line = intakeSeries(weekly, 7);
    expect(line[0]).toBe(2000);
    expect(line[1]).toBe(3000);
  });
});

describe('goalPaceSeries', () => {
  const points = Array.from({ length: 15 }, (_, i) => ({
    date: addDays(START, i),
    trendKg: 80,
  }));

  it('projects downward from the first point for a lose goal', () => {
    const line = goalPaceSeries(points, [], { goal: 'lose', targetRateKgPerWeek: 0.7 });
    expect(line[0]).toBe(80);
    expect(line[7]).toBeCloseTo(79.3, 5); // one week at 0.7 kg
  });

  it('projects upward for a gain goal', () => {
    const line = goalPaceSeries(points, [], { goal: 'gain', targetRateKgPerWeek: 0.7 });
    expect(line[7]).toBeCloseTo(80.7, 5);
  });

  it('runs flat for a maintain goal', () => {
    const line = goalPaceSeries(points, [], { goal: 'maintain', targetRateKgPerWeek: 0 });
    expect(line[14]).toBe(80);
  });

  it('re-anchors at a goal change rather than carrying a stale projection', () => {
    const history: GoalPeriod[] = [
      { startDate: START, goal: 'lose', targetRateKgPerWeek: 0.7, calorieTarget: 2000 },
      { startDate: addDays(START, 7), goal: 'gain', targetRateKgPerWeek: 0.7, calorieTarget: 3000 },
    ];
    const line = goalPaceSeries(points, history, { goal: 'lose', targetRateKgPerWeek: 0.7 });

    // Falling for the first week...
    expect(line[6] as number).toBeLessThan(80);
    // ...then starting again from where the user actually is, and rising.
    expect(line[7]).toBe(80);
    expect(line[14] as number).toBeCloseTo(80.7, 5);
  });

  it('waits for a weigh-in before it can anchor anything', () => {
    const late = [
      { date: START, trendKg: null },
      { date: addDays(START, 1), trendKg: null },
      { date: addDays(START, 2), trendKg: 90 },
      { date: addDays(START, 9), trendKg: 90 },
    ];
    const line = goalPaceSeries(late, [], { goal: 'lose', targetRateKgPerWeek: 0.7 });
    expect(line[0]).toBeNull();
    expect(line[1]).toBeNull();
    expect(line[2]).toBe(90);
    expect(line[3]).toBeCloseTo(89.3, 5);
  });
});

describe('the headline', () => {
  const pace = (avgIntake: number, target: number, goal: 'lose' | 'gain' | 'maintain') =>
    paceFromTotals({
      totalCalories: avgIntake * 10,
      daysLogged: 10,
      maintenanceCalories: 2500,
      targetCalories: target,
      goal,
    });

  it('reads the way the spec puts it, for a gain goal', () => {
    // Maintenance 2,500, eating 2,683, goal 3,000.
    expect(standingLine(pace(2683, 3000, 'gain')))
      .toBe('183 over maintenance — 317 short of your goal.');
  });

  it('mirrors for a lose goal', () => {
    expect(standingLine(pace(2317, 2000, 'lose')))
      .toBe('183 under maintenance — 317 short of your goal.');
  });

  it('says on track once the goal is met or beaten', () => {
    expect(standingLine(pace(3100, 3000, 'gain'))).toBe('600 over maintenance — on track.');
    expect(standingLine(pace(1900, 2000, 'lose'))).toBe('600 under maintenance — on track.');
  });

  it('has its own wording for maintaining', () => {
    expect(standingLine(pace(2550, 2500, 'maintain')))
      .toBe('50 over maintenance — holding steady.');
    expect(standingLine(pace(2900, 2500, 'maintain')))
      .toBe('400 over maintenance — aim to bring it back to the line.');
  });

  it('says nothing confident with nothing logged', () => {
    const empty = paceFromTotals({
      totalCalories: 0, daysLogged: 0, maintenanceCalories: 2500,
      targetCalories: 2000, goal: 'lose',
    });
    expect(standingLine(empty)).toBe('Nothing logged in this range yet.');
  });
});

describe('the two stat boxes', () => {
  it('signs both figures from the goal, so short always reads negative', () => {
    const gaining = paceFromTotals({
      totalCalories: 26_830, daysLogged: 10, maintenanceCalories: 2500,
      targetCalories: 3000, goal: 'gain',
    });
    expect(standing(gaining)).toEqual({ vsMaintenance: 183, vsGoal: -317 });

    const losing = paceFromTotals({
      totalCalories: 23_170, daysLogged: 10, maintenanceCalories: 2500,
      targetCalories: 2000, goal: 'lose',
    });
    expect(standing(losing)).toEqual({ vsMaintenance: -183, vsGoal: -317 });
  });

  it('reads positive against goal once ahead of it', () => {
    const ahead = paceFromTotals({
      totalCalories: 19_000, daysLogged: 10, maintenanceCalories: 2500,
      targetCalories: 2000, goal: 'lose',
    });
    expect(standing(ahead).vsGoal).toBeGreaterThan(0);
  });
});

describe('signedCalories', () => {
  it('marks the direction and groups thousands', () => {
    expect(signedCalories(183)).toBe('+183');
    expect(signedCalories(-317)).toBe('-317');
    expect(signedCalories(0)).toBe('0');
    expect(signedCalories(1500)).toBe('+1,500');
  });
});
