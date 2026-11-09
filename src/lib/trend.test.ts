import { describe, it, expect } from 'vitest';
import {
  alphaFor, smoothSeries, trendSeries, latestTrend, firstTrend, weighInSpan,
  countWeighIns, trendChangeKg,
  DEFAULT_ALPHA,
} from './trend';

describe('smoothSeries', () => {
  it('starts at the first value', () => {
    expect(smoothSeries([80, 81, 82])[0]).toBe(80);
  });

  it('applies the exponential formula', () => {
    const [, second] = smoothSeries([80, 90], 0.1);
    expect(second).toBeCloseTo(0.1 * 90 + 0.9 * 80, 10);
  });

  it('holds steady on a flat series', () => {
    expect(smoothSeries([80, 80, 80, 80])).toEqual([80, 80, 80, 80]);
  });

  it('damps a one-day spike far more than a sustained change', () => {
    const spike = smoothSeries([80, 80, 85, 80, 80]);
    const sustained = smoothSeries([80, 80, 85, 85, 85]);
    expect(spike[4]).toBeLessThan(sustained[4]);
    // A single 5kg jump must move the trend by well under a kilo.
    expect(spike[2] - 80).toBeLessThan(1);
  });

  it('follows a steady decline downward', () => {
    const smoothed = smoothSeries([85, 84, 83, 82, 81, 80]);
    expect(smoothed[5]).toBeLessThan(smoothed[0]);
    expect(smoothed[5]).toBeGreaterThan(80); // lags the raw value, as intended
  });

  it('returns an empty series unchanged', () => {
    expect(smoothSeries([])).toEqual([]);
  });
});

describe('trendSeries', () => {
  const days = [
    { date: '2026-03-02', weightKg: 80 },
    { date: '2026-03-03' },
    { date: '2026-03-04', weightKg: 79.5 },
  ];

  it('reports the raw reading and the trend per day', () => {
    const points = trendSeries(days);
    expect(points[0]).toEqual({ date: '2026-03-02', weightKg: 80, trendKg: 80 });
    expect(points[1].weightKg).toBeNull();
    expect(points[2].weightKg).toBe(79.5);
  });

  it('holds the trend flat on days with no weigh-in', () => {
    const points = trendSeries(days);
    expect(points[1].trendKg).toBe(80);
  });

  it('leaves the trend null before the first weigh-in', () => {
    const points = trendSeries([{ date: '2026-03-01' }, { date: '2026-03-02', weightKg: 80 }]);
    expect(points[0].trendKg).toBeNull();
    expect(points[1].trendKg).toBe(80);
  });

  it('sorts unordered input by date', () => {
    const points = trendSeries([
      { date: '2026-03-04', weightKg: 79 },
      { date: '2026-03-02', weightKg: 80 },
    ]);
    expect(points.map((p) => p.date)).toEqual(['2026-03-02', '2026-03-04']);
    expect(points[0].trendKg).toBe(80);
  });

  it('moves only on weigh-in days', () => {
    const points = trendSeries([
      { date: '2026-03-02', weightKg: 80 },
      { date: '2026-03-03' },
      { date: '2026-03-04' },
      { date: '2026-03-05', weightKg: 78 },
    ]);
    expect(points[2].trendKg).toBe(80);
    // The second weigh-in carries half the weight, so the trend sits midway
    // rather than 0.2 kg from where it started.
    expect(points[3].trendKg).toBeCloseTo(79, 10);
  });

  it('returns an empty series for no days', () => {
    expect(trendSeries([])).toEqual([]);
  });
});

describe('trend readers', () => {
  const points = trendSeries([
    { date: '2026-03-02', weightKg: 80 },
    { date: '2026-03-05' },
    { date: '2026-03-12', weightKg: 78 },
  ]);

  it('finds the first and latest trend values', () => {
    expect(firstTrend(points)).toBe(80);
    expect(latestTrend(points)).toBeCloseTo(79, 10);
  });

  it('returns null when nothing has been weighed', () => {
    const empty = trendSeries([{ date: '2026-03-02' }]);
    expect(firstTrend(empty)).toBeNull();
    expect(latestTrend(empty)).toBeNull();
  });

  it('measures the span between first and last weigh-in', () => {
    expect(weighInSpan(points)).toBe(10);
  });

  it('reports a zero span for fewer than two weigh-ins', () => {
    expect(weighInSpan(trendSeries([{ date: '2026-03-02', weightKg: 80 }]))).toBe(0);
  });

  it('counts weigh-ins, not days', () => {
    expect(countWeighIns(points)).toBe(2);
  });
});

describe('trendChangeKg', () => {
  it('is negative when weight comes off', () => {
    const change = trendChangeKg(trendSeries([
      { date: '2026-03-02', weightKg: 85 },
      { date: '2026-03-09', weightKg: 84 },
    ]));
    expect(change).not.toBeNull();
    expect(change as number).toBeLessThan(0);
  });

  it('is positive when weight goes on', () => {
    const change = trendChangeKg(trendSeries([
      { date: '2026-03-02', weightKg: 84 },
      { date: '2026-03-09', weightKg: 85 },
    ]));
    expect(change as number).toBeGreaterThan(0);
  });

  it('says nothing from a single weigh-in', () => {
    expect(trendChangeKg(trendSeries([{ date: '2026-03-02', weightKg: 85 }]))).toBeNull();
  });

  it('says nothing when the scale was never used', () => {
    expect(trendChangeKg(trendSeries([{ date: '2026-03-02' }]))).toBeNull();
  });
});

describe('responsiveness while there are few weigh-ins', () => {
  it('weights the first readings more, then settles to the usual memory', () => {
    expect(alphaFor(1)).toBe(1);
    expect(alphaFor(2)).toBe(0.5);
    expect(alphaFor(4)).toBe(0.25);
    expect(alphaFor(10)).toBeCloseTo(DEFAULT_ALPHA, 10);
    // And never drops below the floor, however long the history.
    expect(alphaFor(500)).toBe(DEFAULT_ALPHA);
  });

  it('is the plain average of the readings so far while warming up', () => {
    const points = trendSeries([
      { date: '2026-03-02', weightKg: 81 },
      { date: '2026-03-03', weightKg: 80 },
      { date: '2026-03-04', weightKg: 79 },
    ]);
    expect(points[2].trendKg).toBeCloseTo(80, 10);
  });

  it('actually follows a real loss across three weigh-ins', () => {
    const readings = [
      { date: '2026-03-02', weightKg: 85 },
      { date: '2026-03-05', weightKg: 84 },
      { date: '2026-03-08', weightKg: 83 },
    ];
    const change = trendChangeKg(trendSeries(readings)) as number;
    // A fixed 0.1 would report under 0.3 kg of a 2 kg drop. The point of the
    // change is that the line says something by the third weigh-in.
    expect(change).toBeLessThan(-0.9);
    expect(change).toBeGreaterThan(-2);
  });

  it('still damps a single spike once there is a history', () => {
    const flat = Array.from({ length: 20 }, (_, index) => ({
      date: '2026-03-' + String(index + 1).padStart(2, '0'),
      weightKg: 80,
    }));
    const spiked = [...flat, { date: '2026-03-21', weightKg: 85 }];
    const trend = latestTrend(trendSeries(spiked)) as number;

    // The twenty-first reading is well past the warm-up, so a 5 kg jump moves
    // the line by half a kilo, not by five.
    expect(trend - 80).toBeLessThan(1);
    expect(trend).toBeGreaterThan(80);
  });

  it('leaves the very first reading as itself', () => {
    expect(trendSeries([{ date: '2026-03-02', weightKg: 80 }])[0].trendKg).toBe(80);
  });
});
