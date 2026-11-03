// Trends asks one question: am I running the deficit I meant to?
//
// One toggle, one graph, one summary, and the weight trend underneath. Periods
// are rolling rather than calendar, so there is always something to show — a
// calendar month tells someone who has logged for weeks that they have done
// nothing, which is the last thing this screen should say.

import { useMemo, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { useDayRange } from '../hooks/useDayRange';
import { useMaintenanceBasis } from '../hooks/useMaintenanceBasis';
import { useWeekSummaries } from '../hooks/useWeekSummaries';
import {
  addDays, shortDateLabel, todayKey, toWeekKey, weekKeyToMonday, weekdayLabel,
} from '../lib/dates';
import { MAX_WINDOW_DAYS, type MaintenanceResult } from '../lib/maintenance';
import { paceFromTotals, type MaintenanceBasis, type PaceSummary } from '../lib/pace';
import {
  axisTicks, dailyDeficitPoints, sumDays, sumWeeks, weekKeysFor, weeklyDeficitPoints,
  RANGE_DAYS, RANGE_LABELS, type DeficitPoint, type TrendRange,
} from '../lib/deficit';
import { trendChangeKg, trendSeries } from '../lib/trend';
import { formatWeight, fromKg, weightUnitLabel } from '../lib/units';
import type { UserProfile } from '../lib/types';
import { Card, Choice } from '../components/ui';
import { DeficitChart, WeightChart, type WeightPoint } from '../components/charts';
import { DeficitSummaryCard } from '../components/DeficitSummaryCard';
import { MaintenanceBox } from '../components/MaintenanceBox';
import { Page } from '../components/Layout';

export function Trends() {
  const { profile } = useAuth();
  const [range, setRange] = useState<TrendRange>('week');

  if (!profile) return null;

  return (
    <Page title="Trends">
      <Choice
        value={range}
        onChange={setRange}
        columns={3}
        options={[
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' },
        ]}
      />

      {/* Each view owns its own read, so switching to Year never costs the
          week view a query it does not need. */}
      {range === 'year' ? (
        <YearView profile={profile} />
      ) : (
        <DayView range={range} profile={profile} />
      )}
    </Page>
  );
}

/** Week and month: one bar per day, straight from the day logs. */
function DayView({ range, profile }: { range: TrendRange; profile: UserProfile }) {
  const today = todayKey();

  // One read serves both the chart and the maintenance window, so the week
  // view reaches back further than it draws.
  const span = Math.max(RANGE_DAYS[range], MAX_WINDOW_DAYS);
  const from = useMemo(() => addDays(today, -(span - 1)), [today, span]);
  const { days, loading } = useDayRange(from, today);

  const { result, basis } = useMaintenanceBasis(days, profile);

  const start = addDays(today, -(RANGE_DAYS[range] - 1));
  const inRange = (days ?? []).filter((day) => day.date >= start);

  const points = dailyDeficitPoints(
    inRange,
    basis.calories,
    range === 'week' ? weekdayLabel : shortDateLabel,
  );
  const ticks = axisTicks(inRange.map((day) => day.date), range);

  const trend = trendSeries(inRange);
  const weightPoints: WeightPoint[] = trend.map((point) => ({
    label: range === 'week' ? weekdayLabel(point.date) : shortDateLabel(point.date),
    weight: toDisplay(point.weightKg, profile),
    trend: toDisplay(point.trendKg, profile),
  }));

  return (
    <Body
      loading={loading}
      range={range}
      profile={profile}
      result={result}
      basis={basis}
      points={points}
      ticks={ticks}
      pace={paceFor(sumDays(inRange), basis, profile)}
      weightPoints={weightPoints}
      weightChangeKg={trendChangeKg(trend)}
    />
  );
}

/**
 * Year: one bar per ISO week, read from the precomputed weekly roll-ups rather
 * than 365 raw day logs — about 53 small documents for the same answer.
 */
function YearView({ profile }: { profile: UserProfile }) {
  const today = todayKey();

  const keys = useMemo(() => weekKeysFor(today, RANGE_DAYS.year), [today]);
  const { weeks, loading } = useWeekSummaries(keys[0], toWeekKey(today));

  // The maintenance estimate still needs day-level logs, and only ever looks
  // back four weeks.
  const windowFrom = useMemo(() => addDays(today, -(MAX_WINDOW_DAYS - 1)), [today]);
  const { days } = useDayRange(windowFrom, today);
  const { result, basis } = useMaintenanceBasis(days, profile);

  const found = weeks ?? [];
  const points = weeklyDeficitPoints(keys, found, basis.calories);
  const mondays = keys.map(weekKeyToMonday);
  const ticks = axisTicks(mondays, 'year');

  // A week's average weight is the right dot at this zoom.
  const byKey = new Map(found.map((week) => [week.key, week]));
  const trend = trendSeries(
    keys.map((key, index) => ({
      date: mondays[index],
      weightKg: byKey.get(key)?.avgWeightKg ?? undefined,
    })),
  );
  const weightPoints: WeightPoint[] = trend.map((point) => ({
    label: shortDateLabel(point.date),
    weight: toDisplay(point.weightKg, profile),
    trend: toDisplay(point.trendKg, profile),
  }));

  return (
    <Body
      loading={loading}
      range="year"
      profile={profile}
      result={result}
      basis={basis}
      points={points}
      ticks={ticks}
      pace={paceFor(sumWeeks(found), basis, profile)}
      weightPoints={weightPoints}
      weightChangeKg={trendChangeKg(trend)}
      dense
    />
  );
}

function paceFor(
  totals: { totalCalories: number; daysLogged: number },
  basis: MaintenanceBasis,
  profile: UserProfile,
): PaceSummary {
  return paceFromTotals({
    ...totals,
    maintenanceCalories: basis.calories,
    targetCalories: profile.calorieTarget,
    goal: profile.goal,
  });
}

/** Kilograms to whatever the user picked, or null when there is no reading. */
function toDisplay(kg: number | null | undefined, profile: UserProfile): number | null {
  if (kg === null || kg === undefined) return null;
  return Number(fromKg(kg, profile.units).toFixed(1));
}

function Body({
  loading, range, profile, result, basis, points, ticks, pace, weightPoints, weightChangeKg,
  dense = false,
}: {
  loading: boolean;
  range: TrendRange;
  profile: UserProfile;
  result: MaintenanceResult;
  basis: MaintenanceBasis;
  points: DeficitPoint[];
  ticks: string[];
  pace: PaceSummary;
  weightPoints: WeightPoint[];
  weightChangeKg: number | null;
  dense?: boolean;
}) {
  if (loading) {
    return (
      <Card className="mt-4">
        <p className="py-16 text-center text-sm text-slate-400">Loading…</p>
      </Card>
    );
  }

  return (
    <>
      {/* Maintenance leads: it is the number every other figure here is
          measured against, so it belongs above them and kept to one strip. */}
      <div className="mt-4">
        <MaintenanceBox result={result} basis={basis} profile={profile} />
      </div>

      {/* Nothing logged at all: one friendly line beats a graph full of zeros. */}
      {pace.daysLogged === 0 ? (
        <Card className="mt-4">
          <p className="py-12 text-center text-sm text-slate-600">
            Log a few days to see your trend.
          </p>
        </Card>
      ) : (
        <>
          <Card className="mt-4">
            <p className="text-sm font-medium text-slate-700">
              {weightLine(weightChangeKg, range, profile)}
            </p>
            {weightChangeKg !== null && (
              <div className="mt-3">
                <WeightChart
                  data={weightPoints}
                  unit={weightUnitLabel(profile.units)}
                  ticks={ticks}
                  showTrend
                />
              </div>
            )}
          </Card>

          <Card className="mt-4">
            <DeficitChart
              data={points}
              goalDeficit={pace.targetPerDay}
              ticks={ticks}
              dense={dense}
            />
          </Card>

          <div className="mt-4">
            <DeficitSummaryCard pace={pace} range={range} sex={profile.sex} />
          </div>
        </>
      )}
    </>
  );
}

function weightLine(
  changeKg: number | null,
  range: TrendRange,
  profile: UserProfile,
): string {
  if (changeKg === null) return 'Weigh in on two or more days to see your trend.';

  const when = RANGE_LABELS[range];
  // Under a twentieth of a kilo reads as nothing moved, which is its own result.
  if (Math.abs(changeKg) < 0.05) return `Holding steady over ${when}.`;

  const amount = formatWeight(Math.abs(changeKg), profile.units);
  return changeKg < 0 ? `Down ${amount} over ${when}.` : `Up ${amount} over ${when}.`;
}
