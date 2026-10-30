import { describe, it, expect } from 'vitest';
import {
  smoothSeries, trendSeries, latestTrend, firstTrend, weighInSpan, countWeighIns,
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
    expect(points[3].trendKg).toBeCloseTo(DEFAULT_ALPHA * 78 + (1 - DEFAULT_ALPHA) * 80, 10);
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
    expect(latestTrend(points)).toBeCloseTo(DEFAULT_ALPHA * 78 + (1 - DEFAULT_ALPHA) * 80, 10);
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
