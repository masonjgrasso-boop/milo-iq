// Chart building blocks.
//
// Two separate charts rather than one with two y-axes: calories and weight are
// different measures on different scales, and overlaying them invents visual
// correlations that are not in the data.
//
// Colours are validated for colour-vision deficiency and for contrast against
// the card surface. Bars also sit on opposite sides of the zero line, so the
// distinction never rests on colour alone.

import type { ReactNode } from 'react';
import {
  Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { DeficitPoint } from '../lib/deficit';

export const CHART_COLORS = {
  onTarget: '#059669',
  overTarget: '#d97706',
  reference: '#94a3b8',
  grid: '#e2e8f0',
  axis: '#94a3b8',
  // Validated against both bar colours and the card surface for colour-vision
  // deficiency and for contrast; it is also a line rather than a bar.
  average: '#2563eb',
};

const axisProps = {
  stroke: CHART_COLORS.axis,
  tick: { fontSize: 11, fill: '#64748b' },
  tickLine: false,
  axisLine: false,
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
    border: '1px solid #e2e8f0',
    fontSize: 12,
    boxShadow: '0 4px 12px rgb(15 23 42 / 0.08)',
  },
  cursor: { fill: 'rgb(15 23 42 / 0.04)' },
};

/**
 * The deficit against maintenance, period by period.
 *
 * Zero is maintenance, so the sign of a bar is its meaning: above the line is
 * a day that moved the scale, below it a day that did not. That position does
 * the work colour alone should never do.
 *
 * Three marks on one axis, because all three are calories per day: the bars,
 * a flat line for the deficit the goal asks for, and the running average.
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
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 4, bottom: 0, left: -12 }}
          barCategoryGap={dense ? '10%' : '22%'}
        >
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
          <XAxis dataKey="label" {...axisProps} {...tickProps(ticks)} />
          <YAxis {...axisProps} width={48} />
          <Tooltip
            {...tooltipProps}
            formatter={(value, name) => [
              `${Math.abs(Number(value)).toLocaleString()} cal`,
              name === 'runningAvg'
                ? 'Average so far'
                : Number(value) >= 0
                  ? 'Below maintenance'
                  : 'Above maintenance',
            ]}
          />
          {/* Maintenance itself. Crossing it is the only thing that matters. */}
          <ReferenceLine y={0} stroke={CHART_COLORS.axis} />
          <ReferenceLine
            y={goalDeficit}
            stroke={CHART_COLORS.reference}
            strokeDasharray="4 4"
            ifOverflow="extendDomain"
          />
          <Bar dataKey="deficit" radius={2} isAnimationActive={false}>
            {data.map((point, index) => (
              <Cell
                key={index}
                fill={
                  (point.deficit ?? 0) >= 0 ? CHART_COLORS.onTarget : CHART_COLORS.overTarget
                }
              />
            ))}
          </Bar>
          <Line
            type="monotone"
            dataKey="runningAvg"
            stroke={CHART_COLORS.average}
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Three marks need naming, and a ReferenceLine cannot appear in a
          Recharts legend, so the key is written by hand. */}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <Key color={CHART_COLORS.onTarget}>Daily deficit</Key>
        <Key color={CHART_COLORS.average} line>Average so far</Key>
        <Key color={CHART_COLORS.reference} line dashed>
          Goal ({goalDeficit.toLocaleString()} cal)
        </Key>
      </ul>
    </>
  );
}

function Key({ color, line = false, dashed = false, children }: {
  color: string;
  line?: boolean;
  dashed?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={line ? 'h-0.5 w-4 rounded-full' : 'h-2.5 w-2.5 rounded-sm'}
        style={
          dashed
            ? { backgroundImage: `repeating-linear-gradient(to right, ${color} 0 4px, transparent 4px 7px)`, height: 2, width: 16 }
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

export function WeightChart({ data, unit, ticks, showTrend = false }: {
  data: WeightPoint[];
  unit: string;
  /** Same labels as the chart above it, so the two axes line up. */
  ticks: string[];
  showTrend?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
        <XAxis dataKey="label" {...axisProps} {...tickProps(ticks)} />
        <YAxis {...axisProps} width={44} domain={['dataMin - 1', 'dataMax + 1']} />
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
          stroke={CHART_COLORS.onTarget}
          strokeWidth={2}
          dot={{ r: 4, strokeWidth: 0, fill: CHART_COLORS.onTarget }}
          activeDot={{ r: 6 }}
          connectNulls
          isAnimationActive={false}
        />
        {showTrend && (
          <Line
            type="monotone"
            dataKey="trend"
            stroke={CHART_COLORS.overTarget}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** A single headline number. Clearer than a chart when there is one value. */
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
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} width={44} domain={['dataMin - 5', 'dataMax + 5']} />
        <Tooltip
          {...tooltipProps}
          cursor={{ stroke: CHART_COLORS.reference, strokeDasharray: '4 4' }}
          formatter={(value) => [`${Number(value).toFixed(1)} ${unit}`, 'Est. 1RM']}
        />
        <Line
          type="monotone"
          dataKey="e1rm"
          stroke={CHART_COLORS.onTarget}
          strokeWidth={2}
          dot={{ r: 4, strokeWidth: 0, fill: CHART_COLORS.onTarget }}
          activeDot={{ r: 6 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
