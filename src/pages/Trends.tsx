import { useMemo, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { useDayRange } from '../hooks/useDayRange';
import {
  endOfMonth, endOfWeek, shortDateLabel, startOfMonth, startOfWeek, todayKey, weekdayLabel,
} from '../lib/dates';
import { summarizeDays } from '../lib/summaries';
import { fromKg, weightUnitLabel } from '../lib/units';
import { BMI_CATEGORY_LABELS, bmiCategory, calculateBmi, healthyWeightRangeKg } from '../lib/bmi';
import { formatWeight } from '../lib/units';
import { Card, Choice } from '../components/ui';
import { CalorieChart, WeightChart, Stat, type CaloriePoint, type WeightPoint } from '../components/charts';
import { Page } from '../components/Layout';

type Range = 'week' | 'month';

export function Trends() {
  const { profile } = useAuth();
  const [range, setRange] = useState<Range>('week');
  const today = todayKey();

  const { from, to } = useMemo(
    () =>
      range === 'week'
        ? { from: startOfWeek(today), to: endOfWeek(today) }
        : { from: startOfMonth(today), to: endOfMonth(today) },
    [range, today],
  );

  const { days, loading } = useDayRange(from, to);

  if (!profile) return null;
  const unit = weightUnitLabel(profile.units);
  const target = profile.calorieTarget;

  const summary = days
    ? summarizeDays(days, { key: range, start: from, end: to, targetCalories: target })
    : null;

  // Only days up to today are plotted — a half-finished month should not look
  // like a run of zero-calorie days.
  const past = (days ?? []).filter((day) => day.date <= today);

  const caloriePoints: CaloriePoint[] = past.map((day) => ({
    label: range === 'week' ? weekdayLabel(day.date) : shortDateLabel(day.date),
    calories: day.calories,
    logged: day.calories > 0,
  }));

  const weightPoints: WeightPoint[] = past.map((day) => ({
    label: range === 'week' ? weekdayLabel(day.date) : shortDateLabel(day.date),
    weight: day.weightKg === undefined ? null : Number(fromKg(day.weightKg, profile.units).toFixed(1)),
  }));
  const weighIns = weightPoints.filter((point) => point.weight !== null).length;

  // Prefer the most recent weigh-in over the figure typed at onboarding.
  const latestWeightKg =
    [...past].reverse().find((day) => day.weightKg !== undefined)?.weightKg ?? profile.weightKg;
  const bmi = calculateBmi(latestWeightKg, profile.heightCm);
  const healthy = healthyWeightRangeKg(profile.heightCm);

  const deficit = summary?.deficit ?? 0;

  return (
    <Page title="Trends">
      <Choice
        value={range}
        onChange={setRange}
        options={[
          { value: 'week', label: 'This week' },
          { value: 'month', label: 'This month' },
        ]}
      />

      <Card className="mt-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Days logged" value={loading ? '—' : String(summary?.daysLogged ?? 0)} />
          <Stat
            label="Avg intake"
            value={loading ? '—' : `${(summary?.avgCalories ?? 0).toLocaleString()}`}
          />
          <Stat
            label={deficit >= 0 ? 'Under target' : 'Over target'}
            value={loading ? '—' : Math.abs(deficit).toLocaleString()}
            tone={deficit >= 0 ? 'good' : 'warn'}
          />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Measured across the days you logged, so a day you missed never counts as a
          day you fasted.
        </p>
      </Card>

      <h2 className="mt-6 mb-2 text-sm font-semibold text-slate-900">Intake vs target</h2>
      <Card>
        {loading ? (
          <p className="py-12 text-center text-sm text-slate-400">Loading…</p>
        ) : caloriePoints.length > 0 ? (
          <CalorieChart data={caloriePoints} target={target} />
        ) : (
          <p className="py-12 text-center text-sm text-slate-500">Nothing logged yet.</p>
        )}
      </Card>

      <h2 className="mt-6 mb-2 text-sm font-semibold text-slate-900">Weight</h2>
      <Card>
        {loading ? (
          <p className="py-12 text-center text-sm text-slate-400">Loading…</p>
        ) : weighIns >= 2 ? (
          <WeightChart data={weightPoints} unit={unit} />
        ) : (
          <p className="py-12 text-center text-sm text-slate-500">
            Weigh in on two or more days to see your trend.
          </p>
        )}
      </Card>

      <h2 className="mt-6 mb-2 text-sm font-semibold text-slate-900">BMI</h2>
      <Card>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold text-slate-900">{bmi.toFixed(1)}</p>
            <p className="mt-0.5 text-sm font-medium text-slate-600">
              {BMI_CATEGORY_LABELS[bmiCategory(bmi)]}
            </p>
          </div>
          <p className="text-right text-xs text-slate-500">
            Healthy range for your height
            <br />
            <span className="font-medium text-slate-700">
              {formatWeight(healthy.minKg, profile.units, 0)} &ndash;{' '}
              {formatWeight(healthy.maxKg, profile.units, 0)}
            </span>
          </p>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          BMI is a rough population measure. It knows nothing about your muscle mass or
          build, so treat it as one number among several rather than a verdict.
        </p>
      </Card>
    </Page>
  );
}
