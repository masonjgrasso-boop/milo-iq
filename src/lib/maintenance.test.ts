import { describe, it, expect } from 'vitest';
import {
  estimateMaintenance, MIN_DAYS, MIN_WEIGH_INS, MIN_WEIGH_IN_SPAN, MAX_WINDOW_DAYS,
  CONFIDENCE_LABELS, type MaintenanceReady,
} from './maintenance';
import { KCAL_PER_KG } from './targets';
import { addDays } from './dates';
import type { DayLog } from './types';

const TODAY = '2026-03-31';

/**
 * Builds `count` consecutive days ending today, each logging `calories`, with
 * a weigh-in every `weighEvery` days interpolating from `startKg` to `endKg`.
 */
function buildDays({
  count, calories, startKg, endKg, weighEvery = 1,
}: {
  count: number;
  calories: number;
  startKg?: number;
  endKg?: number;
  weighEvery?: number;
}): DayLog[] {
  const days: DayLog[] = [];
  for (let i = 0; i < count; i++) {
    const date = addDays(TODAY, -(count - 1 - i));
    const day: DayLog = { date, calories, entries: [] };
    const weighs = startKg !== undefined && endKg !== undefined;
    const isWeighDay = i % weighEvery === 0 || i === count - 1;
    if (weighs && isWeighDay) {
      day.weightKg = startKg + ((endKg - startKg) * i) / (count - 1);
    }
    days.push(day);
  }
  return days;
}

const ready = (result: ReturnType<typeof estimateMaintenance>): MaintenanceReady => {
  if (result.status !== 'ready') throw new Error(`expected ready, got ${result.reason}`);
  return result;
};

describe('gating', () => {
  it('refuses to estimate with no data at all', () => {
    const result = estimateMaintenance([], TODAY);
    expect(result.status).toBe('not-ready');
    if (result.status === 'not-ready') {
      expect(result.reason).toBe('needs-days');
      expect(result.daysStillNeeded).toBe(MIN_DAYS);
    }
  });

  it('refuses below the minimum number of logged days', () => {
    const result = estimateMaintenance(
      buildDays({ count: MIN_DAYS - 1, calories: 2000, startKg: 80, endKg: 79 }),
      TODAY,
    );
    expect(result.status).toBe('not-ready');
    if (result.status === 'not-ready') {
      expect(result.reason).toBe('needs-days');
      expect(result.daysStillNeeded).toBe(1);
    }
  });

  it('does not count unlogged days towards the minimum', () => {
    const days = buildDays({ count: 20, calories: 2000, startKg: 80, endKg: 79 });
    // Blank out enough days to drop below the threshold.
    for (let i = 0; i < 7; i++) days[i].calories = 0;
    const result = estimateMaintenance(days, TODAY);
    expect(result.status).toBe('not-ready');
  });

  it('refuses without enough weigh-ins', () => {
    const days = buildDays({ count: 20, calories: 2000, startKg: 80, endKg: 79 });
    for (const day of days) delete day.weightKg;
    days[0].weightKg = 80;
    days[19].weightKg = 79;
    const result = estimateMaintenance(days, TODAY);
    expect(result.status).toBe('not-ready');
    if (result.status === 'not-ready') {
      expect(result.reason).toBe('needs-weigh-ins');
      expect(result.weighIns).toBeLessThan(MIN_WEIGH_INS);
    }
  });

  it('refuses when the weigh-ins are bunched too close together', () => {
    const days = buildDays({ count: 20, calories: 2000 });
    // Three weigh-ins, but all within a few days — not enough span to trend.
    days[17].weightKg = 80;
    days[18].weightKg = 79.9;
    days[19].weightKg = 79.8;
    const result = estimateMaintenance(days, TODAY);
    expect(result.status).toBe('not-ready');
    if (result.status === 'not-ready') expect(result.reason).toBe('needs-span');
  });

  it('estimates once every threshold is met', () => {
    const result = estimateMaintenance(
      buildDays({ count: MIN_DAYS, calories: 2000, startKg: 80, endKg: 79.5 }),
      TODAY,
    );
    expect(result.status).toBe('ready');
  });
});

describe('the estimate itself', () => {
  it('returns intake as maintenance when weight held steady', () => {
    const result = ready(
      estimateMaintenance(buildDays({ count: 28, calories: 2200, startKg: 80, endKg: 80 }), TODAY),
    );
    expect(result.maintenanceCalories).toBe(2200);
    expect(result.trendChangeKg).toBeCloseTo(0, 6);
  });

  it('puts maintenance above intake when weight is falling', () => {
    const result = ready(
      estimateMaintenance(buildDays({ count: 28, calories: 2000, startKg: 82, endKg: 80 }), TODAY),
    );
    // Losing weight on 2000 means maintenance is higher than 2000.
    expect(result.maintenanceCalories).toBeGreaterThan(2000);
  });

  it('puts maintenance below intake when weight is rising', () => {
    const result = ready(
      estimateMaintenance(buildDays({ count: 28, calories: 2800, startKg: 80, endKg: 82 }), TODAY),
    );
    expect(result.maintenanceCalories).toBeLessThan(2800);
  });

  it('matches the formula using the smoothed trend change', () => {
    const result = ready(
      estimateMaintenance(buildDays({ count: 28, calories: 2000, startKg: 82, endKg: 80 }), TODAY),
    );
    const span = 27; // first to last weigh-in
    const expected = Math.round(2000 - (result.trendChangeKg * KCAL_PER_KG) / span);
    expect(result.maintenanceCalories).toBe(expected);
  });

  it('averages intake over logged days only', () => {
    const days = buildDays({ count: 28, calories: 2000, startKg: 80, endKg: 80 });
    days[5].calories = 0; // a day that was never logged
    const result = ready(estimateMaintenance(days, TODAY));
    // The forgotten day must not drag the average towards zero.
    expect(result.avgIntake).toBe(2000);
    expect(result.daysLogged).toBe(27);
  });

  it('never looks further back than the maximum window', () => {
    const result = ready(
      estimateMaintenance(buildDays({ count: 90, calories: 2000, startKg: 90, endKg: 80 }), TODAY),
    );
    expect(result.windowDays).toBeLessThanOrEqual(MAX_WINDOW_DAYS);
  });

  it('ignores days in the future', () => {
    const days = buildDays({ count: 20, calories: 2000, startKg: 80, endKg: 79 });
    days.push({ date: addDays(TODAY, 3), calories: 9000, entries: [] });
    const result = ready(estimateMaintenance(days, TODAY));
    expect(result.avgIntake).toBe(2000);
  });
});

describe('confidence', () => {
  it('is low at the bare minimum of data', () => {
    const result = ready(
      estimateMaintenance(
        buildDays({ count: MIN_DAYS, calories: 2000, startKg: 80, endKg: 79.5, weighEvery: 6 }),
        TODAY,
      ),
    );
    expect(result.confidence).toBe('low');
  });

  it('is high with a full window of daily weigh-ins', () => {
    const result = ready(
      estimateMaintenance(
        buildDays({ count: MAX_WINDOW_DAYS, calories: 2000, startKg: 82, endKg: 80 }),
        TODAY,
      ),
    );
    expect(result.confidence).toBe('high');
  });

  it('never decreases as data accumulates', () => {
    const rank = { low: 0, medium: 1, high: 2 };
    const at = (count: number) =>
      rank[
        ready(estimateMaintenance(
          buildDays({ count, calories: 2000, startKg: 82, endKg: 80, weighEvery: 2 }),
          TODAY,
        )).confidence
      ];
    expect(at(14)).toBeLessThanOrEqual(at(21));
    expect(at(21)).toBeLessThanOrEqual(at(28));
  });

  it('has a label for every level', () => {
    expect(Object.keys(CONFIDENCE_LABELS)).toEqual(['low', 'medium', 'high']);
  });

  it('requires a real span before it will trend', () => {
    expect(MIN_WEIGH_IN_SPAN).toBeGreaterThan(0);
  });
});
