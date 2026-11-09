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
  addDays, shortDateLabel, todayKey, toWeekKey, weekKeyToMonday,
} from '../lib/dates';
import {
  blendedTarget, describeAverage, goalChangeIndices, progressToward, GOAL_WORDS,
} from '../lib/goals';
import { MAX_WINDOW_DAYS, type MaintenanceResult } from '../lib/maintenance';
import { paceFromTotals, type MaintenanceBasis, type PaceSummary } from '../lib/pace';
import {
  axisTicks, dailyDeficitPoints, firstActiveIndex, orientPoints, sumDays, sumWeeks,
  weekKeysFor, weeklyDeficitPoints,
  BUCKET_FOR, RANGE_DAYS, RANGE_LABELS, ROLLING_LABELS,
  type BucketSize, type DeficitPoint, type TrendRange,
} from '../lib/deficit';
import { trendChangeKg, trendSeries } from '../lib/trend';
import { formatWeight, fromKg, weightUnitLabel } from '../lib/units';
import type { UserProfile } from '../lib/types';
import { Card, NoteBox, Segmented } from '../components/ui';
import { DeficitChart, WeightChart, type WeightPoint } from '../components/charts';
import { DeficitSummaryCard } from '../components/DeficitSummaryCard';
import { MaintenanceBox } from '../components/MaintenanceBox';
import { Page } from '../components/Layout';

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

/** Month: one bar per day, straight from the day logs. */
function DayView({ profile }: { profile: UserProfile }) {
  const today = todayKey();
  const range: TrendRange = 'month';

  // One read serves both the chart and the maintenance window, whichever of
  // the two reaches back further.
  const span = Math.max(RANGE_DAYS[range], MAX_WINDOW_DAYS);
  const from = useMemo(() => addDays(today, -(span - 1)), [today, span]);
  const { days, loading } = useDayRange(from, today);

  const { result, basis } = useMaintenanceBasis(days, profile);

  const start = addDays(today, -(RANGE_DAYS[range] - 1));
  const windowed = (days ?? []).filter((day) => day.date >= start);

  // Start the chart at the first day with anything on it. Someone four days
  // in should see four bars, not four bars and twenty-six days of blank.
  // Weigh-ins count as well as food, so both charts begin together.
  const begin = firstActiveIndex(
    windowed.map((day) => day.calories > 0 || day.weightKg !== undefined),
  );
  const inRange = windowed.slice(begin);

  const points = orientPoints(
    dailyDeficitPoints(inRange, basis.calories, shortDateLabel),
    profile.goal,
  );
  const dates = inRange.map((day) => day.date);
  const ticks = axisTicks(dates, 'day');

  // Only the days that were logged are scored, so only they decide the target
  // this period is measured against. A period straddling a goal change gets
  // the days-weighted blend of the two, which is what stops a month of
  // deficit days being graded against a gain goal taken up last week.
  const history = profile.goalHistory ?? [];
  const target = blendedTarget(
    inRange.filter((day) => day.calories > 0).map((day) => day.date),
    history,
    profile.calorieTarget,
  );

  const trend = trendSeries(inRange);
  const weightPoints: WeightPoint[] = trend.map((point) => ({
    label: shortDateLabel(point.date),
    weight: toDisplay(point.weightKg, profile),
    trend: toDisplay(point.trendKg, profile),
  }));

  return (
    <Body
      loading={loading}
      range={range}
      bucket="day"
      profile={profile}
      result={result}
      basis={basis}
      points={points}
      ticks={ticks}
      pace={paceFor(sumDays(inRange), basis, profile, target)}
      weightPoints={weightPoints}
      weightChangeKg={trendChangeKg(trend)}
      goalChangeAt={goalChangeIndices(dates, history)}
    />
  );
}

/**
 * Three months and a year: one bar per ISO week, read from the precomputed
 * weekly roll-ups rather than hundreds of raw day logs — about 13 or 53 small
 * documents for the same answer.
 *
 * Ninety daily bars would be three pixels each on a phone, so anything past a
 * month is bucketed by week rather than drawn a day at a time.
 */
function WeekView({ range, profile }: { range: TrendRange; profile: UserProfile }) {
  const today = todayKey();

  const allKeys = useMemo(() => weekKeysFor(today, RANGE_DAYS[range]), [today, range]);
  const { weeks, loading } = useWeekSummaries(allKeys[0], toWeekKey(today));

  // The maintenance estimate still needs day-level logs, and only ever looks
  // back four weeks.
  const windowFrom = useMemo(() => addDays(today, -(MAX_WINDOW_DAYS - 1)), [today]);
  const { days } = useDayRange(windowFrom, today);
  const { result, basis } = useMaintenanceBasis(days, profile);

  const found = weeks ?? [];
  const byKey = new Map(found.map((week) => [week.key, week]));

  // As in the day view: begin at the first week with anything in it. Trimmed
  // weeks are empty by definition, so none of the totals below change.
  const begin = firstActiveIndex(
    allKeys.map((key) => {
      const week = byKey.get(key);
      return (week?.daysLogged ?? 0) > 0 || week?.avgWeightKg != null;
    }),
  );
  const keys = allKeys.slice(begin);

  const points = orientPoints(
    weeklyDeficitPoints(keys, found, basis.calories),
    profile.goal,
  );
  const mondays = keys.map(weekKeyToMonday);
  const ticks = axisTicks(mondays, 'week');

  // Blended by week rather than by day here, since that is the resolution
  // this view reads at. A week containing a goal change is attributed to
  // whichever goal its Monday fell under, which is coarse but never wrong by
  // more than the one week.
  const history = profile.goalHistory ?? [];
  const target = blendedTarget(
    mondays.filter((_, index) => (byKey.get(keys[index])?.daysLogged ?? 0) > 0),
    history,
    profile.calorieTarget,
  );
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
      range={range}
      bucket="week"
      profile={profile}
      result={result}
      basis={basis}
      points={points}
      ticks={ticks}
      pace={paceFor(sumWeeks(found), basis, profile, target)}
      weightPoints={weightPoints}
      weightChangeKg={trendChangeKg(trend)}
      goalChangeAt={goalChangeIndices(mondays, history)}
      // Fifty-odd bars need the tighter packing; thirteen do not.
      dense={range === 'year'}
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

function Body({
  loading, range, bucket, profile, result, basis, points, ticks, pace, weightPoints,
  weightChangeKg, goalChangeAt, dense = false,
}: {
  loading: boolean;
  range: TrendRange;
  /** How wide one bar is, which is what the average line's window follows. */
  bucket: BucketSize;
  profile: UserProfile;
  result: MaintenanceResult;
  basis: MaintenanceBasis;
  points: DeficitPoint[];
  ticks: string[];
  pace: PaceSummary;
  weightPoints: WeightPoint[];
  weightChangeKg: number | null;
  /** Buckets where a new goal started. */
  goalChangeAt: number[];
  dense?: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <p className="py-16 text-center text-sm text-ink-ghost">Loading…</p>
      </Card>
    );
  }

  return (
    <>
      {/* Maintenance leads: it is the number every other figure here is
          measured against, so it belongs above them and it is the one figure
          on the screen that gets the dark card. */}
      <MaintenanceBox result={result} basis={basis} profile={profile} />

      {/* Nothing logged at all: one friendly line beats a graph full of zeros. */}
      {pace.daysLogged === 0 ? (
        <Card>
          <p className="py-12 text-center text-sm text-ink-soft">
            Log a few days to see your trend.
          </p>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
          <Card className="flex flex-col gap-3.5">
            <ChartHeading label="Weight" headline={weightLine(weightChangeKg, range, profile)} />
            {weightChangeKg !== null && (
              <WeightChart
                data={weightPoints}
                unit={weightUnitLabel(profile.units)}
                ticks={ticks}
                goalChangeAt={goalChangeAt}
                showTrend
              />
            )}
          </Card>

          <Card className="flex flex-col gap-3.5">
            <ChartHeading
              label={GOAL_WORDS[profile.goal].chart}
              headline={deficitLine(pace, range)}
            />
            <DeficitChart
              data={points}
              // Oriented the same way as the bars, so for a gain goal the
              // line sits above zero with them rather than mirroring them.
              goalDeficit={progressToward(profile.goal, pace.targetPerDay)}
              ticks={ticks}
              goal={profile.goal}
              averageLabel={ROLLING_LABELS[bucket]}
              goalChangeAt={goalChangeAt}
              dense={dense}
            />
            <NoteBox tone="cream">
              {GOAL_WORDS[profile.goal].offDay} is just one bar. The average line is the
              one to watch.
            </NoteBox>
          </Card>
          </div>

          <DeficitSummaryCard
            pace={pace}
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

/** The two lines above a chart: what it measures, then where it stands. */
function ChartHeading({ label, headline }: { label: string; headline: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-bold text-ink-mute">{label}</p>
      <p className="text-[17px] font-extrabold text-ink">{headline}</p>
    </div>
  );
}

/**
 * The deficit chart's own headline, in the same shape as the weight one.
 *
 * Says which side of maintenance the average sits on and leaves the judgement
 * to the summary card below, so the same sentence works for a deficit, a
 * surplus or holding steady.
 */
function deficitLine(pace: PaceSummary, range: TrendRange): string {
  const when = RANGE_LABELS[range];
  if (Math.round(pace.actualPerDay) === 0) {
    return `Sitting right at maintenance over ${when}.`;
  }
  return `Averaging ${describeAverage(pace.actualPerDay)} over ${when}.`;
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
