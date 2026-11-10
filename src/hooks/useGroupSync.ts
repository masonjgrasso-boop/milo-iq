// Group posting, from the screens that cause it.
//
// One hook, three jobs. It runs the daily sync quietly in the background; it
// hands back the narrow triggers that post the instant something happens; and
// it exposes the same sync as a function the Sharing tab's "Sync now" button
// can call and report on.
//
// Nothing here throws into a screen. A failed post shows as a small error
// through the existing toast, because a feed that quietly stops working is
// worse than one that says so.

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { useToast } from '../context/toast-context';
import {
  loadMemberships, postAchievements, postPhoto, postRulesKept, syncGroups,
  type SyncOutcome,
} from '../data/groupFeed';
import type { Author } from '../data/autopost';
import type { Membership } from '../data/groups';
import { displayNameFor } from '../lib/display';
import { todayKey } from '../lib/dates';
import type { DayLog, Rule } from '../lib/types';

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

export interface GroupPosting {
  /** Posts today's rules if the set handed in is now complete. */
  rulesKept: (rules: Rule[], day: DayLog | undefined) => void;
  /** Re-checks the streak, milestone and calorie-week achievements. */
  achievements: () => void;
  /** Posts a photo that has just finished uploading. */
  photo: (photo: { week: string; thumbUrl: string }) => void;
  /** The whole job, awaited, for the Sync now button. */
  syncNow: () => Promise<SyncOutcome | null>;
}

/**
 * @param runDaily whether this mount should perform the once-a-day sync.
 *   Only one screen should, so Today does and the rest opt out.
 */
export function useGroupSync(runDaily = false): GroupPosting {
  const { user, profile } = useAuth();
  const notify = useToast();

  const [memberships, setMemberships] = useState<Membership[]>([]);

  useEffect(() => {
    if (!user) {
      setMemberships([]);
      return;
    }
    let cancelled = false;
    loadMemberships(user.uid)
      .then((found) => {
        if (!cancelled) setMemberships(found);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Depends on the membership list rather than reading a ref written during
  // render, so every callback below is rebuilt when the list changes and none
  // of them can close over a stale one.
  const input = useCallback(() => {
    if (!user || !profile) return null;
    const author: Author = {
      uid: user.uid,
      name: displayNameFor(user),
      ...(user.photoURL ? { photo: user.photoURL } : {}),
    };
    return { uid: user.uid, author, profile, memberships };
  }, [user, profile, memberships]);

  /** Reports a refusal once, naming the groups, and never throws. */
  const report = useCallback(
    (outcome: { failed: string[] } | null) => {
      if (outcome && outcome.failed.length > 0) {
        notify(`Could not post to ${outcome.failed.join(', ')}.`, 'error');
      }
    },
    [notify],
  );

  // ---- The daily sync ----------------------------------------------------
  useEffect(() => {
    if (!runDaily || !user || !profile || memberships.length === 0) return;
    const today = todayKey();
    if (alreadyRanToday(user.uid, today)) return;

    let cancelled = false;
    (async () => {
      const ready = input();
      if (!ready) return;
      try {
        const outcome = await syncGroups(ready);
        if (cancelled) return;
        report(outcome);
        markRan(user.uid, today);
      } catch {
        if (!cancelled) {
          notify('Could not update your groups. They will catch up later.', 'error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runDaily, user, profile, memberships, input, report, notify]);

  // ---- The immediate triggers --------------------------------------------
  const rulesKept = useCallback(
    (rules: Rule[], day: DayLog | undefined) => {
      const ready = input();
      if (!ready || ready.memberships.length === 0) return;
      postRulesKept(ready, rules, day).then(report).catch(() => undefined);
    },
    [input, report],
  );

  const achievements = useCallback(() => {
    const ready = input();
    if (!ready || ready.memberships.length === 0) return;
    postAchievements(ready).then(report).catch(() => undefined);
  }, [input, report]);

  const photo = useCallback(
    (shot: { week: string; thumbUrl: string }) => {
      const ready = input();
      if (!ready || ready.memberships.length === 0) return;
      postPhoto(ready, shot).then(report).catch(() => undefined);
    },
    [input, report],
  );

  const syncNow = useCallback(async (): Promise<SyncOutcome | null> => {
    const ready = input();
    if (!ready) return null;
    try {
      const outcome = await syncGroups(ready);
      report(outcome);
      return outcome;
    } catch {
      notify('Sync failed. Check your connection.', 'error');
      return null;
    }
  }, [input, report, notify]);

  return { rulesKept, achievements, photo, syncNow };
}
