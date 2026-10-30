import { useMemo, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { useDayRange } from '../hooks/useDayRange';
import {
  addDays, endOfMonth, endOfWeek, shortDateLabel, startOfMonth, startOfWeek, todayKey,
  weekdayLabel,
} from '../lib/dates';
import { estimateMaintenance, MAX_WINDOW_DAYS } from '../lib/maintenance';
import { MaintenanceCard } from '../components/MaintenanceCard';
import { summarizeDays } from '../lib/summaries';
import { trendSeries } from '../lib/trend';
import { fromKg, weightUnitLabel } from '../lib/units';
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

  // The maintenance window is its own fixed look-back, independent of whichever
  // range the user is viewing.
  const window = useMemo(
    () => ({ from: addDays(today, -(MAX_WINDOW_DAYS - 1)), to: today }),
    [today],
  );
  const { days: windowDays } = useDayRange(window.from, window.to);
  const maintenance = useMemo(
    () => estimateMaintenance(windowDays ?? [], today),
    [windowDays, today],
  );

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

  // The smoothed line is what the user should actually read; the dots are just
  // what the scale happened to say that morning.
  const trendPoints = trendSeries(past);
  const weightPoints: WeightPoint[] = past.map((day, index) => {
    const show = (kg: number | null | undefined) =>
      kg === null || kg === undefined ? null : Number(fromKg(kg, profile.units).toFixed(1));
    return {
      label: range === 'week' ? weekdayLabel(day.date) : shortDateLabel(day.date),
      weight: show(day.weightKg),
      trend: show(trendPoints[index]?.trendKg),
    };
  });
  const weighIns = weightPoints.filter((point) => point.weight !== null).length;

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

      <div className="mt-4">
        <MaintenanceCard result={maintenance} />
      </div>

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
          <WeightChart data={weightPoints} unit={unit} showTrend />
        ) : (
          <p className="py-12 text-center text-sm text-slate-500">
            Weigh in on two or more days to see your trend.
          </p>
        )}
      </Card>

    </Page>
  );
}
