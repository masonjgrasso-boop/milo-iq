// Chart building blocks.
//
// Two separate charts rather than one with two y-axes: calories and weight are
// different measures on different scales, and overlaying them invents visual
// correlations that are not in the data.
//
// Both are line charts of the same shape: a reference the user is measured
// against, a dashed line for the plan, a solid line for what they actually
// did, and a callout naming where that solid line has got to. Reading a
// position against a line is easier than reading the height of a bar against
// a remembered baseline, which is why the bars went.
//
// The three calorie lines were checked for colour-vision deficiency as a set
// (scripts/validate_palette.js): worst all-pairs OKLab ΔE 13.7 under
// deuteranopia, 15.3 in normal vision, both passing. They also differ in dash
// pattern and stroke weight, so identity never rests on colour alone, and the
// key below each chart names every one of them — which is what discharges the
// sub-3:1 contrast of the two lighter strokes against white.

import type { ReactNode } from 'react';
import {
  Area, CartesianGrid, ComposedChart, Line, LineChart, ReferenceDot,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

export const CHART_COLORS = {
  /** What the user actually did: the brand green, and the heaviest stroke. */
  you: '#1a3c2f',
  /** The plan. Warm against the cool brand line, and always dashed. */
  goal: '#c9874e',
  /** Maintenance, which is a reference rather than a result. */
  maintenance: '#b5bbb6',
  /** The gap between the two, as a wash. */
  gap: '#b9dcc6',
  /** Weigh-ins as logged, before smoothing. */
  raw: '#b7c7bd',
  /** The ring on a weigh-in dot. */
  dot: '#8fa99a',
  grid: '#eef0ec',
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
 * down as one string per point. Recharts is told to keep every tick so the
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
  cursor: { stroke: CHART_COLORS.reference, strokeDasharray: '4 4' },
};

/**
 * The two-line callout at the end of a series.
 *
 * Recharts hands a label element the `viewBox` of whatever it is attached to,
 * so this renders relative to the final dot. It is anchored to the right and
 * drawn to the left of that dot, because the dot sits hard against the side
 * axis and anything drawn rightward would be clipped.
 */
function Callout({ viewBox, text, sub }: {
  viewBox?: { x?: number; y?: number };
  text: string;
  sub: string;
}) {
  const x = viewBox?.x;
  const y = viewBox?.y;
  if (x === undefined || y === undefined) return null;

  return (
    <g>
      <text
        x={x - 10}
        y={y - 7}
        textAnchor="end"
        fontSize={12}
        fontWeight={800}
        fill="#121614"
      >
        {text}
      </text>
      <text x={x - 10} y={y + 8} textAnchor="end" fontSize={11} fill="#5d665f">
        {sub}
      </text>
    </g>
  );
}

export interface CaloriePoint {
  label: string;
  /** Maintenance as it would have been measured on this date. */
  maintenance: number;
  /** Maintenance plus whatever the goal in force on this date asked for. */
  goal: number;
  /** The trailing average of what was eaten, or null with nothing logged. */
  you: number | null;
  /** [goal, you], which Recharts fills between. Null leaves a gap. */
  band: [number, number] | null;
}

/**
 * Calories over time: where maintenance was, where the plan wanted you, and
 * where you actually were.
 *
 * The shaded band between the last two is the whole point of the chart. A
 * reader should be able to see the size of the gap without reading a single
 * number, and see it closing without comparing two bar heights a month apart.
 */
export function CalorieChart({ data, ticks, latest, maintenanceMeasured }: {
  data: CaloriePoint[];
  /** One entry per point; an empty string leaves that point unlabelled. */
  ticks: string[];
  /** The callout on the final point of the user's own line. */
  latest: { value: number; text: string; sub: string } | null;
  /** False while maintenance is still the starting estimate. */
  maintenanceMeasured: boolean;
}) {
  return (
    <>
      <div className="h-[220px] lg:h-[290px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 22, right: 0, bottom: 0, left: 2 }}>
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
            <XAxis dataKey="label" {...axisProps} {...tickProps(ticks)} />
            <YAxis
              {...axisProps}
              orientation="right"
              width={46}
              tickCount={4}
              domain={['dataMin - 120', 'dataMax + 120']}
              tickFormatter={(value: number) => Math.round(value).toLocaleString()}
            />
            <Tooltip
              {...tooltipProps}
              formatter={(value, name) => {
                if (name === 'band') return [];
                const label = name === 'you'
                  ? 'You'
                  : name === 'goal'
                    ? 'Goal'
                    : 'Maintenance';
                return [`${Math.round(Number(value)).toLocaleString()} cal`, label];
              }}
            />

            {/* Drawn first so both lines sit on top of it. */}
            <Area
              dataKey="band"
              stroke="none"
              fill={CHART_COLORS.gap}
              fillOpacity={0.5}
              connectNulls
              isAnimationActive={false}
            />

            <Line
              type="monotone"
              dataKey="maintenance"
              stroke={CHART_COLORS.maintenance}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="goal"
              stroke={CHART_COLORS.goal}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="you"
              stroke={CHART_COLORS.you}
              strokeWidth={3}
              strokeLinecap="round"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />

            {latest && data.length > 0 && (
              <ReferenceDot
                x={data[data.length - 1].label}
                y={latest.value}
                r={4.5}
                fill={CHART_COLORS.you}
                stroke="#fff"
                strokeWidth={2}
                label={<Callout text={latest.text} sub={latest.sub} />}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-soft">
        <Key color={CHART_COLORS.you} line>You</Key>
        <Key color={CHART_COLORS.goal} line dashed>Goal</Key>
        <Key color={CHART_COLORS.maintenance} line>
          Maintenance{maintenanceMeasured ? '' : ' (estimate)'}
        </Key>
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
  /** The scale reading, as a faint dot. */
  weight: number | null;
  /** The smoothed trend, which is the line to read. */
  trend?: number | null;
  /** Where the goal rate says the trend should be by now. */
  pace?: number | null;
}

/**
 * Weight over time, in the same shape as the calorie chart: the weigh-ins as
 * faint dots, the smoothed trend thick on top, and the goal pace dashed.
 *
 * The trend is the one to read, so it is the one that carries the weight of
 * the ink; the raw readings are there to show it is not invented.
 */
export function WeightChart({ data, unit, ticks, latest, showPace = false }: {
  data: WeightPoint[];
  unit: string;
  /** Same labels as the chart above it, so the two axes line up. */
  ticks: string[];
  /** The callout on the final point of the trend line. */
  latest: { value: number; text: string; sub: string } | null;
  /** Hidden until there is a goal rate worth projecting. */
  showPace?: boolean;
}) {
  return (
    <>
      <div className="h-[200px] lg:h-[270px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 22, right: 0, bottom: 0, left: 2 }}>
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
            <XAxis dataKey="label" {...axisProps} {...tickProps(ticks)} />
            <YAxis
              {...axisProps}
              orientation="right"
              width={46}
              tickCount={4}
              domain={['dataMin - 0.6', 'dataMax + 0.6']}
              tickFormatter={(value: number) => value.toFixed(1)}
            />
            <Tooltip
              {...tooltipProps}
              formatter={(value, name) => [
                `${Number(value).toFixed(1)} ${unit}`,
                name === 'trend' ? 'Trend' : name === 'pace' ? 'Goal pace' : 'Weighed',
              ]}
            />

            {/* The raw readings: dots only, no connecting stroke, so they read
                as evidence behind the trend rather than as a second series. */}
            <Line
              type="monotone"
              dataKey="weight"
              stroke="none"
              dot={{ r: 3, strokeWidth: 0, fill: CHART_COLORS.raw }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: CHART_COLORS.dot, fill: '#fff' }}
              isAnimationActive={false}
            />

            {showPace && (
              <Line
                type="monotone"
                dataKey="pace"
                stroke={CHART_COLORS.goal}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}

            <Line
              type="monotone"
              dataKey="trend"
              stroke={CHART_COLORS.you}
              strokeWidth={3}
              strokeLinecap="round"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />

            {latest && data.length > 0 && (
              <ReferenceDot
                x={data[data.length - 1].label}
                y={latest.value}
                r={4.5}
                fill={CHART_COLORS.you}
                stroke="#fff"
                strokeWidth={2}
                label={<Callout text={latest.text} sub={latest.sub} />}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-soft">
        <Key color={CHART_COLORS.you} line>Trend</Key>
        <Key color={CHART_COLORS.dot} hollow>Weigh-ins</Key>
        {showPace && <Key color={CHART_COLORS.goal} line dashed>Goal pace</Key>}
      </ul>
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
          formatter={(value) => [`${Number(value).toFixed(1)} ${unit}`, 'Est. 1RM']}
        />
        <Line
          type="monotone"
          dataKey="e1rm"
          stroke={CHART_COLORS.you}
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

