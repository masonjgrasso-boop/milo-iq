// @vitest-environment jsdom
//
// Does the chart actually draw?
//
// There is no browser in this project's test run, so these do not check that
// anything looks right. What they do catch is the class of mistake that is
// invisible to TypeScript and fatal on screen: a dataKey that matches no
// field, a Recharts prop that silently does nothing, a ranged area handed the
// wrong shape, or a custom label that throws when it is cloned.
//
// ResponsiveContainer measures its parent, which in jsdom is zero wide, so it
// is replaced with a fixed size. Everything inside it is the real Recharts.

import { cloneElement, type ReactElement } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: (
      { children }: { children: ReactElement<{ width?: number; height?: number }> },
    ) => cloneElement(children, { width: 800, height: 400 }),
  };
});

import { CalorieChart, WeightChart } from './charts';

const labels = ['Mar 2', 'Mar 3', 'Mar 4', 'Mar 5'];

const caloriePoints = labels.map((label, index) => {
  const you = index === 1 ? null : 2400 + index * 20;
  return {
    label,
    maintenance: 2500,
    goal: 2900,
    you,
    band: you === null ? null : ([2900, you] as [number, number]),
  };
});

const weightPoints = labels.map((label, index) => ({
  label,
  weight: index % 2 === 0 ? 80 + index * 0.1 : null,
  trend: 80 + index * 0.05,
  pace: 80 + index * 0.08,
}));

afterEach(cleanup);

describe('CalorieChart', () => {
  it('draws all three lines and the shaded gap', () => {
    const { container } = render(
      <CalorieChart
        data={caloriePoints}
        ticks={labels}
        latest={{ value: 2460, text: 'You -40', sub: '2,460 cal' }}
        maintenanceMeasured
      />,
    );

    // Maintenance, goal and you.
    expect(container.querySelectorAll('.recharts-line')).toHaveLength(3);
    // The band between goal and you.
    expect(container.querySelectorAll('.recharts-area').length).toBeGreaterThanOrEqual(1);
    // Every line drew an actual path rather than an empty one.
    const curves = [...container.querySelectorAll('.recharts-line .recharts-curve')];
    expect(curves).toHaveLength(3);
    for (const curve of curves) {
      expect(curve.getAttribute('d')?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it('puts the callout on the end of the line', () => {
    render(
      <CalorieChart
        data={caloriePoints}
        ticks={labels}
        latest={{ value: 2460, text: 'You -40', sub: '2,460 cal' }}
        maintenanceMeasured
      />,
    );
    expect(screen.getByText('You -40')).toBeTruthy();
    expect(screen.getByText('2,460 cal')).toBeTruthy();
  });

  it('names every line, so identity never rests on colour', () => {
    render(
      <CalorieChart data={caloriePoints} ticks={labels} latest={null} maintenanceMeasured />,
    );
    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByText('Goal')).toBeTruthy();
    expect(screen.getByText('Maintenance')).toBeTruthy();
  });

  it('says so while maintenance is still an estimate', () => {
    render(
      <CalorieChart
        data={caloriePoints}
        ticks={labels}
        latest={null}
        maintenanceMeasured={false}
      />,
    );
    expect(screen.getByText(/Maintenance \(estimate\)/)).toBeTruthy();
  });

  it('renders with nothing logged rather than throwing', () => {
    const blank = labels.map((label) => ({
      label, maintenance: 2500, goal: 2900, you: null, band: null,
    }));
    const { container } = render(
      <CalorieChart data={blank} ticks={labels} latest={null} maintenanceMeasured={false} />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('survives a single point, which is what day one looks like', () => {
    const one = [caloriePoints[0]];
    const { container } = render(
      <CalorieChart
        data={one}
        ticks={['Mar 2']}
        latest={{ value: 2400, text: 'You -100', sub: '2,400 cal' }}
        maintenanceMeasured={false}
      />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
    expect(screen.getByText('You -100')).toBeTruthy();
  });
});

describe('WeightChart', () => {
  it('draws the trend, the pace and the weigh-in dots', () => {
    const { container } = render(
      <WeightChart
        data={weightPoints}
        unit="kg"
        ticks={labels}
        latest={{ value: 80.2, text: '80.2 kg', sub: 'trend' }}
        showPace
      />,
    );

    // Weigh-ins, pace and trend.
    expect(container.querySelectorAll('.recharts-line')).toHaveLength(3);
    expect(screen.getByText('80.2 kg')).toBeTruthy();
    expect(screen.getByText('trend')).toBeTruthy();
    expect(screen.getByText('Goal pace')).toBeTruthy();
  });

  it('hides the pace line when there is no pace to draw', () => {
    const { container } = render(
      <WeightChart data={weightPoints} unit="kg" ticks={labels} latest={null} />,
    );
    expect(container.querySelectorAll('.recharts-line')).toHaveLength(2);
    expect(screen.queryByText('Goal pace')).toBeNull();
  });

  it('renders before anyone has stepped on a scale', () => {
    const blank = labels.map((label) => ({
      label, weight: null, trend: null, pace: null,
    }));
    const { container } = render(
      <WeightChart data={blank} unit="kg" ticks={labels} latest={null} />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
