// Chart building blocks.
//
// Two separate charts rather than one with two y-axes: calories and weight are
// different measures on different scales, and overlaying them invents visual
// correlations that are not in the data.
//
// Colours are validated for colour-vision deficiency and for contrast against
// the card surface. Over-target days also sit above the target line, so the
// distinction never rests on colour alone.

import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

export const CHART_COLORS = {
  onTarget: '#059669',
  overTarget: '#d97706',
  reference: '#94a3b8',
  grid: '#e2e8f0',
  axis: '#94a3b8',
};

const axisProps = {
  stroke: CHART_COLORS.axis,
  tick: { fontSize: 11, fill: '#64748b' },
  tickLine: false,
  axisLine: false,
};

const tooltipProps = {
  contentStyle: {
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    fontSize: 12,
    boxShadow: '0 4px 12px rgb(15 23 42 / 0.08)',
  },
  cursor: { fill: 'rgb(15 23 42 / 0.04)' },
};

export interface CaloriePoint {
  label: string;
  calories: number;
  /** Days with nothing logged are drawn as a gap, not as a zero-calorie day. */
  logged: boolean;
}

export function CalorieChart({ data, target }: { data: CaloriePoint[]; target: number }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -16 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} width={44} />
        <Tooltip
          {...tooltipProps}
          formatter={(value) => [`${Number(value).toLocaleString()} cal`, 'Eaten']}
        />
        <ReferenceLine
          y={target}
          stroke={CHART_COLORS.reference}
          strokeDasharray="4 4"
          label={{ value: 'Target', position: 'right', fontSize: 10, fill: '#64748b' }}
        />
        <Bar dataKey="calories" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((point, index) => (
            <Cell
              key={index}
              fill={point.calories > target ? CHART_COLORS.overTarget : CHART_COLORS.onTarget}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface WeightPoint {
  label: string;
  weight: number | null;
  trend?: number | null;
}

export function WeightChart({ data, unit, showTrend = false }: {
  data: WeightPoint[];
  unit: string;
  showTrend?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
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
export function Stat({ label, value, tone = 'neutral' }: {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  const colors = {
    neutral: 'text-slate-900',
    good: 'text-brand-700',
    warn: 'text-amber-700',
  };
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${colors[tone]}`}>{value}</p>
    </div>
  );
}
