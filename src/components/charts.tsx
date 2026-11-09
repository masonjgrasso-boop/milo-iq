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
//
// The deficit chart is oriented by the goal before it gets here: up is always
// the direction the user meant to go. So the colours stay put — green above
// the line, amber below — and it is the legend that changes wording, which is
// what keeps "a bar above the line is a good day" true for every goal.

import type { ReactNode } from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { DeficitPoint } from '../lib/deficit';
import { GOAL_WORDS } from '../lib/goals';
import type { Goal } from '../lib/types';
import { barPath, barRadii } from '../lib/bars';

/**
 * Calories on the side axis, signed, so the reader can tell which side of
 * maintenance a bar is on without counting gridlines.
 */
const signedCalories = (value: number): string =>
  (value > 0 ? '+' : '') + value.toLocaleString();

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
export function DeficitChart({
  data, goalDeficit, ticks, goal, averageLabel, dense = false, goalChangeAt = [],
}: {
  data: DeficitPoint[];
  /** The gap the goal asks for, already oriented the same way as the bars. */
  goalDeficit: number;
  /** One entry per bar; an empty string leaves that bar unlabelled. */
  ticks: string[];
  /** Names the two sides of the zero line. */
  goal: Goal;
  /** What the trailing average covers, which depends on the bar width. */
  averageLabel: string;
  /** The year view packs its fifty-odd bars tighter. */
  dense?: boolean;
  /** Bars where a new goal started, as indices into `data`. */
  goalChangeAt?: number[];
}) {
  const words = GOAL_WORDS[goal];
  // Maintaining asks for no gap, so its goal line would sit exactly on the
  // zero line already drawn. Two lines in one place reads as a rendering bug.
  const showGoalLine = goalDeficit !== 0;

  return (
    <>
      <div className="h-[190px] lg:h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 14, right: 0, bottom: 0, left: 2 }}
          barCategoryGap={dense ? '10%' : '22%'}
        >
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
          <XAxis dataKey="label" {...axisProps} {...tickProps(ticks)} />
          {/* On the right, matching the weight chart below it, and sparse
              enough that three numbers never crowd a phone. */}
          <YAxis
            {...axisProps}
            orientation="right"
            width={46}
            tickCount={3}
            tickFormatter={signedCalories}
          />
          <Tooltip
            {...tooltipProps}
            formatter={(value, name) => [
              `${Math.abs(Number(value)).toLocaleString()} cal`,
              name === 'rollingAvg'
                ? averageLabel
                : Number(value) >= 0
                  ? words.above
                  : words.below,
            ]}
          />
          {/* Maintenance itself. Crossing it is the only thing that matters. */}
          <ReferenceLine y={0} stroke={CHART_COLORS.zero} />
          {/* No label on the line itself: a tall bar reaching the top of the
              plot would sit underneath it. The number is in the key instead. */}
          {showGoalLine && (
            <ReferenceLine
              y={goalDeficit}
              stroke={CHART_COLORS.reference}
              strokeDasharray="4 4"
              strokeWidth={2}
              ifOverflow="extendDomain"
            />
          )}
          {/* Where the goal changed. An annotation rather than a series: the
              bars either side are measured against different targets, and
              without this the step in the dashed goal line looks like a bug.
              Vertical, so it cannot be mistaken for the goal line itself. */}
          {goalChangeAt.map((index) => (
            <ReferenceLine
              key={`goal-${index}`}
              x={data[index]?.label}
              stroke={CHART_COLORS.reference}
              strokeDasharray="3 3"
              strokeWidth={1.5}
            />
          ))}
          <Bar dataKey="deficit" shape={<DeficitBar />} isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey="rollingAvg"
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
        <Key color={CHART_COLORS.under}>{words.above}</Key>
        <Key color={CHART_COLORS.over}>{words.below}</Key>
        <Key color={CHART_COLORS.average} line>{averageLabel}</Key>
        {showGoalLine && (
          <Key color={CHART_COLORS.reference} line dashed>
            Goal ({signedCalories(goalDeficit)} cal)
          </Key>
        )}
        {goalChangeAt.length > 0 && (
          <Key color={CHART_COLORS.reference} vertical>Goal changed</Key>
        )}
      </ul>
    </>
  );
}

function Key({
  color, line = false, dashed = false, hollow = false, vertical = false, children,
}: {
  color: string;
  line?: boolean;
  dashed?: boolean;
  /** A ring rather than a fill, matching an unfilled weigh-in dot. */
  hollow?: boolean;
  /** An upright dashed tick, matching a goal-change marker. */
  vertical?: boolean;
  children: ReactNode;
}) {
  if (vertical) {
    return (
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-3.5 w-0.5"
          style={{
            backgroundImage:
              `repeating-linear-gradient(to bottom, ${color} 0 3px, transparent 3px 6px)`,
          }}
        />
        {children}
      </li>
    );
  }

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
export function WeightChart({
  data, unit, ticks, showTrend = false, goalChangeAt = [],
}: {
  data: WeightPoint[];
  unit: string;
  /** Same labels as the chart above it, so the two axes line up. */
  ticks: string[];
  showTrend?: boolean;
  /** Points where a new goal started, as indices into `data`. */
  goalChangeAt?: number[];
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
        {goalChangeAt.map((index) => (
          <ReferenceLine
            key={`goal-${index}`}
            x={data[index]?.label}
            stroke={CHART_COLORS.reference}
            strokeDasharray="3 3"
            strokeWidth={1.5}
          />
        ))}
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
        {goalChangeAt.length > 0 && (
          <Key color={CHART_COLORS.reference} vertical>Goal changed</Key>
        )}
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
