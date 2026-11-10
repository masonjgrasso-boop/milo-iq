// Keeping the groups up to date, once a day.
//
// Two jobs that used to happen only when somebody opened the sharing screen
// and flipped a switch, which meant a mirror could sit weeks out of date:
//
//   1. Republish each group's mirror, so what the group sees is current and
//      a gap in logging actually shows as one.
//   2. Add the day's automatic lines to each group's digest: this week's
//      weight trend, a week whose calorie goal was met, today's rules if they
//      were all kept, a weight milestone, a logging streak, this week's photo.
//
// It runs at most once a day per device, guarded by a note in localStorage,
// because the whole job is a handful of reads and doing it on every
// navigation would be waste for no gain. Every write is idempotent, so a
// second run after the guard is cleared changes nothing.
//
// The three achievements that persist — milestones, streaks and a met
// calorie week — would otherwise be announced again every day for as long as
// they stood. Each group's pointer records the highest already announced, so
// each is said once.

import { useEffect } from 'react';
import { useAuth } from '../context/auth-context';
import {
  listMyGroups, publishShare, recordAnnounced, type Membership,
} from '../data/groups';
import { postToGroups, groupsFor } from '../data/autopost';
import { listDays } from '../data/days';
import { listRules } from '../data/rules';
import { listExercises } from '../data/workouts';
import { listPhotos } from '../data/photos';
import { buildSharedSummary } from '../lib/groups';
import {
  calorieWeekPost, loggingStreak, milestonePost, milestonesReached, photoPost,
  rulesPost, streakMilestone, streakPost, weightPost,
} from '../lib/feed';
import { goalOn } from '../lib/goals';
import { paceSummary } from '../lib/pace';
import { estimateMaintenance } from '../lib/maintenance';
import { maintenanceBasis } from '../lib/pace';
import { displayNameFor } from '../lib/display';
import { addDays, startOfWeek, todayKey, toWeekKey } from '../lib/dates';
import { appliesOn, isMet } from '../lib/rules';
import { firstTrend, latestTrend, trendSeries } from '../lib/trend';
import { fromKg } from '../lib/units';
import type { User } from 'firebase/auth';
import type { DayLog, UserProfile } from '../lib/types';

const GUARD = 'milo.groupSync';

/** Far enough back to see a hundred-day streak, which is the longest we name. */
const STREAK_LOOKBACK_DAYS = 101;
/** Enough for the maintenance window and the four-week trend. */
const BASE_LOOKBACK_DAYS = 28;

function alreadyRanToday(uid: string, today: string): boolean {
  try {
    return window.localStorage.getItem(`${GUARD}.${uid}`) === today;
  } catch {
    // Private browsing, or storage blocked. Syncing twice is harmless.
    return false;
  }
}

function markRan(uid: string, today: string): void {
  try {
    window.localStorage.setItem(`${GUARD}.${uid}`, today);
  } catch {
    // Nothing to do: the sync has already happened either way.
  }
}

async function sync(
  user: User,
  profile: UserProfile,
  memberships: Membership[],
): Promise<void> {
  const today = todayKey();
  const author = {
    uid: user.uid,
    name: displayNameFor(user),
    ...(user.photoURL ? { photo: user.photoURL } : {}),
  };

  const sharesGoals = memberships.some((membership) => membership.shareFlags?.goals);
  const sharesPhotos = memberships.some((membership) => membership.shareFlags?.photos);

  // A streak longer than a month cannot be seen in a month of logs, so the
  // read widens only when some group is actually listening for one. A hundred
  // small documents once a day is well inside the free tier, and the local
  // cache serves most of them.
  const lookback = sharesGoals ? STREAK_LOOKBACK_DAYS : BASE_LOOKBACK_DAYS;

  const [days, rules, exercises, photos] = await Promise.all([
    listDays(user.uid, addDays(today, -(lookback - 1)), today),
    listRules(user.uid),
    listExercises(user.uid),
    sharesPhotos ? listPhotos(user.uid, 8) : Promise.resolve([]),
  ]);

  // The mirror has always described the last four weeks, whatever was read.
  const recent = days.filter((day) => day.date >= addDays(today, -(BASE_LOOKBACK_DAYS - 1)));

  // ---- The mirrors -------------------------------------------------------
  await Promise.all(
    memberships.map((membership) => {
      const flags = membership.shareFlags;
      if (!flags) return Promise.resolve();

      const summary = buildSharedSummary({
        uid: user.uid,
        displayName: author.name,
        flags,
        days: recent,
        today,
        targetCalories: profile.calorieTarget,
        goalHistory: profile.goalHistory ?? [],
        units: profile.units,
        rules,
        exercises,
        photos: photos.map((photo) => ({ week: photo.week, thumbUrl: photo.thumbUrl })),
      });
      return publishShare(user.uid, membership.groupId, summary).catch(() => undefined);
    }),
  );

  const weekStart = startOfWeek(today);
  const thisWeek = recent.filter((day) => day.date >= weekStart);
  const week = toWeekKey(today);

  // ---- This week's weight trend, and milestones toward the goal ----------
  const trend = trendSeries(recent);
  const latestKg = latestTrend(trend);

  if (groupsFor(memberships, 'weight').length > 0) {
    const weekTrend = trendSeries(thisWeek);
    const start = firstTrend(weekTrend);
    const end = latestTrend(weekTrend);

    if (start !== null && end !== null) {
      const spark = weekTrend
        .map((point) => point.trendKg)
        .filter((value): value is number => value !== null)
        .map((kg) => Number(fromKg(kg, profile.units).toFixed(2)));

      await postToGroups(memberships, author, today, weightPost(end - start, profile.units, spark));
    }
  }

  // ---- A week whose calorie goal was met ---------------------------------
  const calorieGroups = groupsFor(memberships, 'calorieWeek');
  if (calorieGroups.length > 0) {
    const basis = maintenanceBasis(
      estimateMaintenance(recent, today),
      profile,
      latestKg ?? undefined,
    );
    const pace = paceSummary({
      days: recent,
      start: weekStart,
      end: today,
      maintenanceCalories: basis.calories,
      targetCalories: profile.calorieTarget,
      goal: profile.goal,
    });

    // Met means the average is at or past what the goal asked for, with
    // enough of the week logged to mean anything.
    const met = pace.daysLogged >= 4 && pace.gapPerDay <= 0;
    const unannounced = calorieGroups.filter(
      (membership) => membership.lastCalorieWeek !== week,
    );

    if (met && unannounced.length > 0) {
      await postToGroups(memberships, author, today, calorieWeekPost(pace.daysLogged));
      await Promise.all(
        unannounced.map((membership) =>
          recordAnnounced(user.uid, membership.groupId, { lastCalorieWeek: week }),
        ),
      );
    }
  }

  // ---- A weight milestone toward the current goal ------------------------
  const milestoneGroups = groupsFor(memberships, 'milestone');
  if (milestoneGroups.length > 0 && latestKg !== null) {
    const period = goalOn(profile.goalHistory ?? [], today);
    const startWeightKg = period?.startWeightKg ?? profile.weightKg;
    const reached = milestonesReached(
      startWeightKg, latestKg, period?.goal ?? profile.goal, profile.units,
    );

    const behind = milestoneGroups.filter(
      (membership) => reached > (membership.lastMilestone ?? 0),
    );
    if (reached > 0 && behind.length > 0) {
      await postToGroups(
        memberships, author, today,
        milestonePost(reached, profile.units, period?.goal ?? profile.goal),
      );
      await Promise.all(
        behind.map((membership) =>
          recordAnnounced(user.uid, membership.groupId, { lastMilestone: reached }),
        ),
      );
    }
  }

  // ---- A logging streak worth naming -------------------------------------
  const streakGroups = groupsFor(memberships, 'streak');
  if (streakGroups.length > 0) {
    const reached = streakMilestone(loggingStreak(days, today));
    const behind = streakGroups.filter(
      (membership) => reached > (membership.lastStreak ?? 0),
    );

    if (reached > 0 && behind.length > 0) {
      await postToGroups(memberships, author, today, streakPost(reached));
      await Promise.all(
        behind.map((membership) =>
          recordAnnounced(user.uid, membership.groupId, { lastStreak: reached }),
        ),
      );
    }
  }

  // ---- Today's rules, if every one that applied was kept ------------------
  if (groupsFor(memberships, 'rules').length > 0) {
    const day: DayLog | undefined = recent.find((entry) => entry.date === today);
    const due = rules.filter((rule) => rule.active && appliesOn(rule, today));
    const met = due.filter((rule) => isMet(rule, day?.rules?.[rule.id]));

    if (due.length > 0 && met.length === due.length) {
      await postToGroups(memberships, author, today, rulesPost(due.length));
    }
  }

  // ---- This week's progress photo ----------------------------------------
  if (groupsFor(memberships, 'photo').length > 0) {
    const shot = photos.find((photo) => photo.week === week);
    if (shot) {
      await postToGroups(memberships, author, today, photoPost(week, shot.thumbUrl));
    }
  }
}

/**
 * Runs the daily group sync in the background.
 *
 * Silent by design: nothing here is worth interrupting someone's morning
 * with. A group that has gone, or a network that is down, simply means the
 * sync happens tomorrow instead.
 */
export function useGroupSync(): void {
  const { user, profile } = useAuth();

  useEffect(() => {
    if (!user || !profile) return;
    const today = todayKey();
    if (alreadyRanToday(user.uid, today)) return;

    let cancelled = false;
    (async () => {
      try {
        const memberships = await listMyGroups(user.uid);
        if (cancelled || memberships.length === 0) return;
        await sync(user, profile, memberships);
        if (!cancelled) markRan(user.uid, today);
      } catch {
        // Tomorrow, then.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, profile]);
}
