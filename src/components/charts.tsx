// Chart building blocks.
//
// Two separate charts rather than one with two y-axes: calories and weight are
// different measures on different scales, and overlaying them invents visual
// correlations that are not in the data.
//
// Colours come from the design tokens. The two bar colours were checked for
// colour-vision deficiency against each other and the card surface (OKLab
// ΔE 30.9 under protanopia), and bars also sit on opposite sides of the zero
// line, so the distinction never rests on colour alone.

import type { ReactNode } from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { DeficitPoint } from '../lib/deficit';
import { barPath, barRadii } from '../lib/bars';

export const CHART_COLORS = {
  /** Under maintenance: the brand green. */
  under: '#1a3c2f',
  /** Over maintenance. */
  over: '#c9874e',
  /** The running average, a line rather than a fill. */
  average: '#2f8a5b',
  /** Weigh-ins as logged, before smoothing. */
  raw: '#b7c7bd',
  /** The ring on a weigh-in dot. */
  dot: '#8fa99a',
  grid: '#eef0ec',
  zero: '#c9cfc9',
  reference: '#8a928c',
  axis: '#8a928c',
};

const axisProps = {
  tick: { fontSize: 10, fill: CHART_COLORS.axis },
  tickLine: false,
  axisLine: false,
  stroke: CHART_COLORS.axis,
};

/**
 * Axis labels are chosen upstream, where the calendar is known, and handed
 * down as one string per bucket. Recharts is told to keep every tick so the
 * blanks hold their place, which is what stops labels from colliding or
 * needing to be rotated.
 */
const tickProps = (ticks: string[]) => ({
  interval: 0 as const,
  tickFormatter: (_value: string, index: number) => ticks[index] ?? '',
});

const tooltipProps = {
  contentStyle: {
    borderRadius: 12,
    border: '1px solid #e6e8e3',
    fontSize: 12,
    fontWeight: 600,
    boxShadow: '0 8px 24px -14px rgb(18 22 20 / 0.12)',
  },
  cursor: { fill: 'rgb(18 22 20 / 0.04)' },
};

/**
 * One deficit bar. The end pointing away from maintenance is rounded and the
 * end touching it stays nearly square, so a bar always reads as growing out
 * of the zero line rather than floating beside it.
 */
function DeficitBar(props: {
  x?: number; y?: number; width?: number; height?: number;
  payload?: DeficitPoint;
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!width || !height) return null;
  const under = (payload?.deficit ?? 0) >= 0;
  const { top, bottom } = barRadii(under);
  return (
    <path
      d={barPath(x, y, width, height, top, bottom)}
      fill={under ? CHART_COLORS.under : CHART_COLORS.over}
    />
  );
}

/**
 * The deficit against maintenance, period by period.
 *
 * Zero is maintenance, so the sign of a bar is its meaning: above the line is
 * a day that moved the scale, below it a day that did not. That position does
 * the work colour alone should never do.
 *
 * Three marks on one axis, because all three are calories per day: the bars,
 * a flat line for the deficit the goal asks for, and the running average.
 * There is no left axis — the goal line carries its own number, which buys
 * back about fifty pixels of plot on a phone.
 */
export function DeficitChart({ data, goalDeficit, ticks, dense = false }: {
  data: DeficitPoint[];
  goalDeficit: number;
  /** One entry per bar; an empty string leaves that bar unlabelled. */
  ticks: string[];
  /** Month and year views pack the bars tighter. */
  dense?: boolean;
}) {
  return (
    <>
      <div className="h-[190px] lg:h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 14, right: 2, bottom: 0, left: 2 }}
          barCategoryGap={dense ? '10%' : '22%'}
        >
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
          <XAxis dataKey="label" {...axisProps} {...tickProps(ticks)} />
          <YAxis hide />
          <Tooltip
            {...tooltipProps}
            formatter={(value, name) => [
              `${Math.abs(Number(value)).toLocaleString()} cal`,
              name === 'runningAvg'
                ? 'Average so far'
                : Number(value) >= 0
                  ? 'Under maintenance'
                  : 'Over',
            ]}
          />
          {/* Maintenance itself. Crossing it is the only thing that matters. */}
          <ReferenceLine y={0} stroke={CHART_COLORS.zero} />
          <ReferenceLine
            y={goalDeficit}
            stroke={CHART_COLORS.reference}
            strokeDasharray="4 4"
            strokeWidth={2}
            ifOverflow="extendDomain"
            label={{
              value: `Goal ${goalDeficit.toLocaleString()}`,
              position: 'insideTopRight',
              fontSize: 10,
              fontWeight: 700,
              fill: '#5d665f',
              dy: -6,
            }}
          />
          <Bar dataKey="deficit" shape={<DeficitBar />} isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey="runningAvg"
            stroke={CHART_COLORS.average}
            strokeWidth={2.5}
            strokeLinecap="round"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      </div>

      {/* Four marks need naming, and a ReferenceLine cannot appear in a
          Recharts legend, so the key is written by hand. It also discharges
          the contrast obligation on the amber, which is below 3:1 on white. */}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-soft">
        <Key color={CHART_COLORS.under}>Under maintenance</Key>
        <Key color={CHART_COLORS.over}>Over</Key>
        <Key color={CHART_COLORS.average} line>Average so far</Key>
        <Key color={CHART_COLORS.reference} line dashed>Goal</Key>
      </ul>
    </>
  );
}

function Key({ color, line = false, dashed = false, hollow = false, children }: {
  color: string;
  line?: boolean;
  dashed?: boolean;
  /** A ring rather than a fill, matching an unfilled weigh-in dot. */
  hollow?: boolean;
  children: ReactNode;
}) {
  if (hollow) {
    return (
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-full border-2"
          style={{ borderColor: color }}
        />
        {children}
      </li>
    );
  }
  return (
    <li className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={line ? 'h-[3px] w-4 rounded-full' : 'h-2.5 w-2.5 rounded-[3px]'}
        style={
          dashed
            ? {
                backgroundImage:
                  `repeating-linear-gradient(to right, ${color} 0 4px, transparent 4px 7px)`,
                height: 2,
                width: 16,
              }
            : { backgroundColor: color }
        }
      />
      {children}
    </li>
  );
}

export interface WeightPoint {
  label: string;
  weight: number | null;
  trend?: number | null;
}

/**
 * Weight over time: the weigh-ins as hollow dots on a thin line, with the
 * smoothed trend drawn thick on top. The trend is the one to read, so it is
 * the one that carries the weight of the ink.
 */
export function WeightChart({ data, unit, ticks, showTrend = false }: {
  data: WeightPoint[];
  unit: string;
  /** Same labels as the chart above it, so the two axes line up. */
  ticks: string[];
  showTrend?: boolean;
}) {
  return (
    <>
    <div className="h-[168px] lg:h-[240px]">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 2, bottom: 0, left: 2 }}>
        <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
        <XAxis dataKey="label" {...axisProps} {...tickProps(ticks)} />
        <YAxis
          {...axisProps}
          orientation="right"
          width={34}
          tickCount={3}
          domain={['dataMin - 1', 'dataMax + 1']}
          tickFormatter={(value: number) => value.toFixed(1)}
        />
        <Tooltip
          {...tooltipProps}
          cursor={{ stroke: CHART_COLORS.reference, strokeDasharray: '4 4' }}
          formatter={(value, name) => [
            `${Number(value).toFixed(1)} ${unit}`,
            name === 'trend' ? 'Trend' : 'Weighed',
          ]}
        />
        <Line
          type="monotone"
          dataKey="weight"
          stroke={CHART_COLORS.raw}
          strokeWidth={1.5}
          dot={{ r: 3.5, strokeWidth: 2, stroke: CHART_COLORS.dot, fill: '#fff' }}
          activeDot={{ r: 5, strokeWidth: 2, stroke: CHART_COLORS.dot, fill: '#fff' }}
          connectNulls
          isAnimationActive={false}
        />
        {showTrend && (
          <Line
            type="monotone"
            dataKey="trend"
            stroke={CHART_COLORS.under}
            strokeWidth={3}
            strokeLinecap="round"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
    </div>

    {showTrend && (
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-soft">
        <Key color={CHART_COLORS.under} line>Trend</Key>
        <Key color={CHART_COLORS.dot} hollow>Weigh-ins</Key>
      </ul>
    )}
    </>
  );
}

export interface StrengthPoint {
  label: string;
  e1rm: number;
}

/**
 * Estimated one-rep max per session. A single series, so no legend: the
 * heading names it.
 */
export function StrengthChart({ data, unit }: { data: StrengthPoint[]; unit: string }) {
  return (
    <div className="h-[180px] lg:h-[260px]">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 2, bottom: 0, left: 2 }}>
        <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
        <YAxis
          {...axisProps}
          orientation="right"
          width={38}
          tickCount={3}
          domain={['dataMin - 5', 'dataMax + 5']}
        />
        <Tooltip
          {...tooltipProps}
          cursor={{ stroke: CHART_COLORS.reference, strokeDasharray: '4 4' }}
          formatter={(value) => [`${Number(value).toFixed(1)} ${unit}`, 'Est. 1RM']}
        />
        <Line
          type="monotone"
          dataKey="e1rm"
          stroke={CHART_COLORS.under}
          strokeWidth={3}
          strokeLinecap="round"
          dot={{ r: 3.5, strokeWidth: 2, stroke: CHART_COLORS.dot, fill: '#fff' }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
    </div>
  );
}
