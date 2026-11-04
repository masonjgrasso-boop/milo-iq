import { describe, it, expect } from 'vitest';
import { barPath, barRadii, BAR_RADIUS } from './bars';

/** Every number a path string contains, in order. */
const numbers = (d: string): number[] =>
  (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('barRadii', () => {
  it('rounds the top of a bar that sits under maintenance', () => {
    expect(barRadii(true)).toEqual({ top: BAR_RADIUS.far, bottom: BAR_RADIUS.near });
  });

  it('rounds the bottom of a bar that sits over it', () => {
    expect(barRadii(false)).toEqual({ top: BAR_RADIUS.near, bottom: BAR_RADIUS.far });
  });

  it('keeps the rounded end larger than the end on the line', () => {
    expect(BAR_RADIUS.far).toBeGreaterThan(BAR_RADIUS.near);
  });
});

describe('barPath', () => {
  it('starts and closes on the top edge', () => {
    const d = barPath(10, 20, 30, 40, 5, 2);
    expect(d.startsWith('M15,20')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('stays inside the box it was given', () => {
    const [x, y, w, h] = [10, 20, 30, 40];
    const d = barPath(x, y, w, h, 5, 2);
    // Arc flags aside, no coordinate should escape the rectangle.
    for (const value of numbers(d)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(Math.max(x + w, y + h));
    }
    expect(d).toContain(`V${y + h - 2}`);
  });

  it('never produces a radius larger than half the bar', () => {
    // A 3px-tall bar cannot carry a 5px corner.
    const d = barPath(0, 0, 4, 3, 5, 5);
    expect(d).toContain('A1.5,1.5');
    expect(d).not.toContain('A5,5');
  });

  it('degrades to square corners rather than negative ones', () => {
    const d = barPath(0, 0, 10, 10, -4, 0);
    expect(d).toContain('A0,0');
    expect(numbers(d).some(Number.isNaN)) .toBe(false);
  });

  it('produces no NaN for a zero-height bar', () => {
    const d = barPath(5, 5, 10, 0, 5, 2);
    expect(numbers(d).some(Number.isNaN)).toBe(false);
  });

  it('rounds the far end more than the near end, which is the whole point', () => {
    const under = barPath(0, 0, 20, 60, BAR_RADIUS.far, BAR_RADIUS.near);
    const over = barPath(0, 0, 20, 60, BAR_RADIUS.near, BAR_RADIUS.far);
    expect(under).not.toEqual(over);
    expect(under.startsWith(`M${BAR_RADIUS.far},0`)).toBe(true);
    expect(over.startsWith(`M${BAR_RADIUS.near},0`)).toBe(true);
  });
});
