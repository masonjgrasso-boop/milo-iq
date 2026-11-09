// Trends asks one question: am I running the deficit I meant to?
//
// Two line charts of the same shape. Calories: where maintenance was, where
// the plan wanted you, where you actually were, and the gap between the last
// two shaded in. Weight: the smoothed trend against the pace the goal implies.
//
// Periods are rolling rather than calendar, so there is always something to
// show, and a chart starts at the user's first log rather than padding the
// left edge with weeks of blank.
//
// Every line is recomputed as of each date. Maintenance especially: it is
// measured from a trailing window of logs, so it moves, and drawing today's
// figure flat across the period would misplace every earlier point on it.
// That is why both views read a lead-in of extra history behind the range
// they draw — without it the left edge would always ease in from the starting
// estimate, however long the user had been logging.

import { useMemo, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { useDayRange } from '../hooks/useDayRange';
import { useMaintenanceBasis } from '../hooks/useMaintenanceBasis';
import { useWeekSummaries } from '../hooks/useWeekSummaries';
import { addDays, shortDateLabel, todayKey, toWeekKey, weekKeyToMonday } from '../lib/dates';
import { blendedTarget, GOAL_WORDS } from '../lib/goals';
import { MAX_WINDOW_DAYS, type MaintenanceResult } from '../lib/maintenance';
import { paceFromTotals, type MaintenanceBasis, type PaceSummary } from '../lib/pace';
import {
  axisTicks, firstActiveIndex, sumDays, sumWeeks, weekKeysFor,
  BUCKET_FOR, RANGE_DAYS, RANGE_LABELS, type BucketSize, type TrendRange,
} from '../lib/deficit';
import {
  goalPaceSeries, goalSeries, intakeSeries, maintenanceSeries, signedCalories,
  standing, standingLine, type IntakeBucket, type MaintenancePoint,
} from '../lib/chartSeries';
import { estimateTdee } from '../lib/targets';
import { trendChangeKg, trendSeries } from '../lib/trend';
import { formatWeight, fromKg, weightUnitLabel } from '../lib/units';
import type { PeriodSummary, UserProfile } from '../lib/types';
import { Card, Eyebrow, Segmented, Stat } from '../components/ui';
import {
  CalorieChart, WeightChart, type CaloriePoint, type WeightPoint,
} from '../components/charts';
import { DeficitSummaryCard } from '../components/DeficitSummaryCard';
import { MaintenanceBox } from '../components/MaintenanceBox';
import { Page } from '../components/Layout';

/**
 * Extra history read behind the drawn range, so the maintenance line is a
 * measurement from its very first point rather than easing in from the
 * estimate. One window's worth is all it takes.
 */
const LEAD_IN_DAYS = MAX_WINDOW_DAYS - 1;

export function Trends() {
  const { profile } = useAuth();
  // A month is the shortest span that says anything about a trend, so it is
  // where the screen opens.
  const [range, setRange] = useState<TrendRange>('month');

  if (!profile) return null;

  return (
    <Page wide eyebrow="The long view" title="Trends">
      <Segmented
        value={range}
        onChange={setRange}
        size="lg"
        options={[
          { value: 'month', label: 'Month' },
          { value: 'quarter', label: '3 Months' },
          { value: 'year', label: 'Year' },
        ]}
      />

      {/* Each view owns its own read, so switching to Year never costs the
          month view a query it does not need. */}
      {BUCKET_FOR[range] === 'day' ? (
        <DayView profile={profile} />
      ) : (
        <WeekView range={range} profile={profile} />
      )}
    </Page>
  );
}

/** The formula figure, used wherever there is not yet enough to measure one. */
function startingEstimate(profile: UserProfile, latestWeightKg?: number): number {
  return Math.round(
    estimateTdee({
      weightKg: latestWeightKg ?? profile.weightKg,
      heightCm: profile.heightCm,
      age: profile.age,
      sex: profile.sex,
      activity: profile.activity,
    }),
  );
}

/** Month: one point per day, straight from the day logs. */
function DayView({ profile }: { profile: UserProfile }) {
  const today = todayKey();
  const range: TrendRange = 'month';

  const from = useMemo(
    () => addDays(today, -(RANGE_DAYS.month + LEAD_IN_DAYS - 1)),
    [today],
  );
  const { days, loading } = useDayRange(from, today);
  const { result, basis, latestWeightKg } = useMaintenanceBasis(days, profile);

  const all = days ?? [];
  const buckets: IntakeBucket[] = all.map((day) => ({
    date: day.date,
    totalCalories: day.calories,
    daysLogged: day.calories > 0 ? 1 : 0,
    weightKg: day.weightKg ?? null,
  }));

  // Computed across the lead-in too, then sliced, so the first drawn point
  // already has a full window behind it.
  const estimate = startingEstimate(profile, latestWeightKg);
  const maintenance = maintenanceSeries(buckets, MAX_WINDOW_DAYS, estimate);
  const intake = intakeSeries(buckets, 7);
  const trend = trendSeries(all);

  const start = addDays(today, -(RANGE_DAYS.month - 1));
  const windowStart = all.findIndex((day) => day.date >= start);
  const offset = windowStart === -1 ? 0 : windowStart;

  // Then begin at the first day with anything on it, so somebody four days in
  // sees four days rather than twenty-six days of blank.
  const begin = offset + firstActiveIndex(
    all.slice(offset).map((day) => day.calories > 0 || day.weightKg !== undefined),
  );

  const shown = all.slice(begin);
  const history = profile.goalHistory ?? [];

  return (
    <Body
      loading={loading}
      range={range}
      bucket="day"
      profile={profile}
      result={result}
      basis={basis}
      labels={shown.map((day) => shortDateLabel(day.date))}
      dates={shown.map((day) => day.date)}
      maintenance={maintenance.slice(begin)}
      goal={goalSeries(buckets, maintenance, history, profile).slice(begin)}
      intake={intake.slice(begin)}
      weigh={trend.slice(begin).map((point) => point.weightKg)}
      trend={trend.slice(begin).map((point) => point.trendKg)}
      goalPace={goalPaceSeries(trend, history, profile).slice(begin)}
      weightChangeKg={trendChangeKg(trend.slice(begin))}
      standingOf={paceFor(
        sumDays(shown),
        basis,
        profile,
        blendedTarget(
          shown.filter((day) => day.calories > 0).map((day) => day.date),
          history,
          profile.calorieTarget,
        ),
      )}
    />
  );
}

/**
 * Three months and a year: one point per ISO week, read from the precomputed
 * weekly roll-ups rather than hundreds of raw day logs.
 *
 * A week's own average intake is already a seven-day average, so the user's
 * line means the same thing at both zoom levels without a special case.
 */
function WeekView({ range, profile }: { range: TrendRange; profile: UserProfile }) {
  const today = todayKey();

  const allKeys = useMemo(
    () => weekKeysFor(today, RANGE_DAYS[range] + LEAD_IN_DAYS),
    [today, range],
  );
  const { weeks, loading } = useWeekSummaries(allKeys[0], toWeekKey(today));

  // The headline maintenance figure still comes from day-level logs, which is
  // what the box at the top of the screen reports.
  const windowFrom = useMemo(() => addDays(today, -(MAX_WINDOW_DAYS - 1)), [today]);
  const { days } = useDayRange(windowFrom, today);
  const { result, basis, latestWeightKg } = useMaintenanceBasis(days, profile);

  const byKey = new Map((weeks ?? []).map((week) => [week.key, week]));
  const mondays = allKeys.map(weekKeyToMonday);

  const buckets: IntakeBucket[] = allKeys.map((key, index) => {
    const week = byKey.get(key);
    return {
      date: mondays[index],
      totalCalories: week?.totalCalories ?? 0,
      daysLogged: week?.daysLogged ?? 0,
      weightKg: week?.avgWeightKg ?? null,
    };
  });

  const estimate = startingEstimate(profile, latestWeightKg);
  const maintenance = maintenanceSeries(buckets, MAX_WINDOW_DAYS, estimate);
  const intake = intakeSeries(buckets, 7);
  const trend = trendSeries(
    buckets.map((bucket) => ({
      date: bucket.date,
      weightKg: bucket.weightKg ?? undefined,
    })),
  );

  const drawnFrom = Math.max(0, allKeys.length - Math.ceil(RANGE_DAYS[range] / 7));
  const begin = drawnFrom + firstActiveIndex(
    buckets.slice(drawnFrom).map((bucket) => bucket.daysLogged > 0 || bucket.weightKg !== null),
  );

  const history = profile.goalHistory ?? [];
  const shownBuckets = buckets.slice(begin);
  const shownWeeks = allKeys
    .slice(begin)
    .map((key) => byKey.get(key))
    .filter((week): week is PeriodSummary => week !== undefined);

  return (
    <Body
      loading={loading}
      range={range}
      bucket="week"
      profile={profile}
      result={result}
      basis={basis}
      labels={shownBuckets.map((bucket) => shortDateLabel(bucket.date))}
      dates={shownBuckets.map((bucket) => bucket.date)}
      maintenance={maintenance.slice(begin)}
      goal={goalSeries(buckets, maintenance, history, profile).slice(begin)}
      intake={intake.slice(begin)}
      weigh={trend.slice(begin).map((point) => point.weightKg)}
      trend={trend.slice(begin).map((point) => point.trendKg)}
      goalPace={goalPaceSeries(trend, history, profile).slice(begin)}
      weightChangeKg={trendChangeKg(trend.slice(begin))}
      standingOf={paceFor(
        sumWeeks(shownWeeks),
        basis,
        profile,
        blendedTarget(
          shownBuckets.filter((bucket) => bucket.daysLogged > 0).map((bucket) => bucket.date),
          history,
          profile.calorieTarget,
        ),
      )}
    />
  );
}

function paceFor(
  totals: { totalCalories: number; daysLogged: number },
  basis: MaintenanceBasis,
  profile: UserProfile,
  /** The blended target for the period, which may span more than one goal. */
  targetCalories: number,
): PaceSummary {
  return paceFromTotals({
    ...totals,
    maintenanceCalories: basis.calories,
    targetCalories,
    // The goal in force now is what the labels describe, even for a period
    // that began under a different one. This screen reads as "where am I".
    goal: profile.goal,
  });
}

/** Kilograms to whatever the user picked, or null when there is no reading. */
function toDisplay(kg: number | null | undefined, profile: UserProfile): number | null {
  if (kg === null || kg === undefined) return null;
  return Number(fromKg(kg, profile.units).toFixed(1));
}

/** The last value in a series that has one. */
function lastValue(series: (number | null)[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    const value = series[i];
    if (value !== null) return value;
  }
  return null;
}

function Body({
  loading, range, bucket, profile, result, basis, labels, dates, maintenance, goal, intake,
  weigh, trend, goalPace, weightChangeKg, standingOf,
}: {
  loading: boolean;
  range: TrendRange;
  /** How wide one point is, which is what the user's own line averages over. */
  bucket: BucketSize;
  profile: UserProfile;
  result: MaintenanceResult;
  basis: MaintenanceBasis;
  labels: string[];
  dates: string[];
  maintenance: MaintenancePoint[];
  goal: number[];
  intake: (number | null)[];
  weigh: (number | null)[];
  trend: (number | null)[];
  goalPace: (number | null)[];
  weightChangeKg: number | null;
  standingOf: PaceSummary;
}) {
  if (loading) {
    return (
      <Card>
        <p className="py-16 text-center text-sm text-ink-ghost">Loading…</p>
      </Card>
    );
  }

  const words = GOAL_WORDS[profile.goal];
  const ticks = axisTicks(dates, bucket);
  const { vsMaintenance, vsGoal } = standing(standingOf);
  const when = RANGE_LABELS[range].replace('the ', '');

  const caloriePoints: CaloriePoint[] = labels.map((label, index) => {
    const you = intake[index];
    return {
      label,
      maintenance: maintenance[index].calories,
      goal: goal[index],
      you,
      band: you === null ? null : [goal[index], you],
    };
  });

  const weightPoints: WeightPoint[] = labels.map((label, index) => ({
    label,
    weight: toDisplay(weigh[index], profile),
    trend: toDisplay(trend[index], profile),
    pace: toDisplay(goalPace[index], profile),
  }));

  // The callouts describe the end of each line, which is "now" — distinct
  // from the stat boxes, which average the whole range.
  const lastYou = lastValue(intake);
  const lastMaintenance = maintenance.length === 0
    ? null
    : maintenance[maintenance.length - 1].calories;
  const calorieCallout = lastYou === null || lastMaintenance === null ? null : {
    value: lastYou,
    text: `You ${signedCalories(lastYou - lastMaintenance)}`,
    sub: `${lastYou.toLocaleString()} cal`,
  };

  const lastTrend = lastValue(weightPoints.map((point) => point.trend ?? null));
  const weightCallout = lastTrend === null ? null : {
    value: lastTrend,
    text: `${lastTrend.toFixed(1)} ${weightUnitLabel(profile.units)}`,
    sub: 'trend',
  };

  const measured = maintenance.length > 0 && maintenance[maintenance.length - 1].measured;
  const hasPace = goalPace.filter((value) => value !== null).length >= 2;

  return (
    <>
      {/* Maintenance leads: it is the number every other figure here is
          measured against, so it belongs above them and it is the one figure
          on the screen that gets the dark card. */}
      <MaintenanceBox result={result} basis={basis} profile={profile} />

      {/* Nothing logged at all: one friendly line beats an empty graph. */}
      {standingOf.daysLogged === 0 ? (
        <Card>
          <p className="py-12 text-center text-sm text-ink-soft">
            Log a few days to see your trend.
          </p>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
            <Card className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <Eyebrow>Daily {words.gap} &middot; {when}</Eyebrow>
                <p className="text-[17px] font-extrabold leading-snug text-ink">
                  {standingLine(standingOf)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Stat
                  label="vs maintenance"
                  value={signedCalories(vsMaintenance)}
                  tone={vsGoal >= 0 ? 'good' : 'neutral'}
                />
                <Stat
                  label="vs goal"
                  value={signedCalories(vsGoal)}
                  tone={vsGoal >= 0 ? 'good' : 'warn'}
                />
              </div>

              <CalorieChart
                data={caloriePoints}
                ticks={ticks}
                latest={calorieCallout}
                maintenanceMeasured={measured}
              />

              <p className="border-t border-line-soft pt-3 text-xs text-ink-faint">
                Line is your {bucket === 'day' ? '7-day' : 'weekly'} average. The shaded gap
                is how far you are from goal.
              </p>
            </Card>

            <Card className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <Eyebrow>Weight &middot; {when}</Eyebrow>
                <p className="text-[17px] font-extrabold leading-snug text-ink">
                  {weightLine(weightChangeKg, range, profile)}
                </p>
              </div>

              <WeightChart
                data={weightPoints}
                unit={weightUnitLabel(profile.units)}
                ticks={ticks}
                latest={weightCallout}
                showPace={hasPace}
              />

              <p className="border-t border-line-soft pt-3 text-xs text-ink-faint">
                The line smooths out day-to-day water. The dashed line is where your goal
                rate would have you by now.
              </p>
            </Card>
          </div>

          <DeficitSummaryCard
            pace={standingOf}
            range={range}
            sex={profile.sex}
            goal={profile.goal}
            target={profile.calorieTarget}
          />
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
