// Keeping the groups up to date, once a day.
//
// Two jobs that used to happen only when somebody opened the sharing screen
// and flipped a switch, which meant a mirror could sit weeks out of date:
//
//   1. Republish each group's mirror, so what the group sees is current and
//      a gap in logging actually shows as one.
//   2. Write the automatic posts for the period: this week's weight trend,
//      today's rules if they were all kept, this week's progress photo.
//
// It runs at most once a day per device, guarded by a note in localStorage,
// because the whole job is a handful of reads and a handful of writes and
// doing it on every navigation would be wasteful for no gain. Every write is
// idempotent, so a second run after the guard is cleared changes nothing.

import { useEffect } from 'react';
import { useAuth } from '../context/auth-context';
import { listMyGroups, publishShare, type Membership } from '../data/groups';
import { postToGroups, groupsFor } from '../data/autopost';
import { listDays } from '../data/days';
import { listRules } from '../data/rules';
import { listExercises } from '../data/workouts';
import { listPhotos } from '../data/photos';
import { buildSharedSummary } from '../lib/groups';
import { photoPost, rulesPost, weightPost } from '../lib/feed';
import { displayNameFor } from '../lib/display';
import { addDays, startOfWeek, todayKey, toWeekKey } from '../lib/dates';
import { appliesOn, isMet } from '../lib/rules';
import { firstTrend, latestTrend, trendSeries } from '../lib/trend';
import { fromKg } from '../lib/units';
import type { User } from 'firebase/auth';
import type { UserProfile } from '../lib/types';

const GUARD = 'milo.groupSync';

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

  const needsPhotos = memberships.some((membership) => membership.shareFlags?.photos);
  const [days, rules, exercises, photos] = await Promise.all([
    listDays(user.uid, addDays(today, -27), today),
    listRules(user.uid),
    listExercises(user.uid),
    needsPhotos ? listPhotos(user.uid, 8) : Promise.resolve([]),
  ]);

  // ---- The mirrors -------------------------------------------------------
  await Promise.all(
    memberships.map((membership) => {
      const flags = membership.shareFlags;
      if (!flags) return Promise.resolve();

      const summary = buildSharedSummary({
        uid: user.uid,
        displayName: author.name,
        flags,
        days,
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

  // ---- This week's weight trend ------------------------------------------
  if (groupsFor(memberships, 'weight').length > 0) {
    const weekStart = startOfWeek(today);
    const thisWeek = trendSeries(days.filter((day) => day.date >= weekStart));
    const start = firstTrend(thisWeek);
    const end = latestTrend(thisWeek);

    if (start !== null && end !== null) {
      const spark = thisWeek
        .map((point) => point.trendKg)
        .filter((value): value is number => value !== null)
        .map((kg) => Number(fromKg(kg, profile.units).toFixed(2)));

      await postToGroups(
        memberships, author, 'weight', toWeekKey(today),
        weightPost(end - start, profile.units, spark),
      );
    }
  }

  // ---- Today's rules, if every one that applied was kept ------------------
  if (groupsFor(memberships, 'rules').length > 0) {
    const day = days.find((entry) => entry.date === today);
    const due = rules.filter((rule) => rule.active && appliesOn(rule, today));
    const met = due.filter((rule) => isMet(rule, day?.rules?.[rule.id]));

    if (due.length > 0 && met.length === due.length) {
      await postToGroups(memberships, author, 'rules', today, rulesPost(due.length));
    }
  }

  // ---- This week's progress photo ----------------------------------------
  if (groupsFor(memberships, 'photo').length > 0) {
    const week = toWeekKey(today);
    const thisWeek = photos.find((photo) => photo.week === week);
    if (thisWeek) {
      await postToGroups(memberships, author, 'photo', week, {
        ...photoPost(week),
        thumbUrl: thisWeek.thumbUrl,
      });
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
