// Whether the Groups tab should wear a dot.
//
// Two things earn one: a nudge nobody has read, and a post nobody has seen.
//
// The post half works off two denormalised timestamps rather than a query of
// every feed: the group carries when anything was last posted in it, and the
// member's own pointer carries when they last opened it. So the check is one
// small read per group, which the local cache usually serves, instead of a
// paged query per group on every app open.

import { useEffect, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { getGroup, listMyGroups } from '../data/groups';
import { listMyNudges } from '../data/posts';

/** Firestore hands timestamps back as objects; what we need is the millis. */
function millis(value: unknown): number {
  const stamp = value as { toMillis?: () => number } | undefined;
  return stamp?.toMillis?.() ?? 0;
}

export function useGroupBadge(): boolean {
  const { user } = useAuth();
  const [unseen, setUnseen] = useState(false);

  useEffect(() => {
    if (!user) {
      setUnseen(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [nudges, memberships] = await Promise.all([
          listMyNudges(user.uid, 1).catch(() => []),
          listMyGroups(user.uid),
        ]);
        if (cancelled) return;

        if (nudges.length > 0) {
          setUnseen(true);
          return;
        }

        const groups = await Promise.all(
          memberships.map((membership) =>
            getGroup(membership.groupId)
              .then((group) => ({ group, membership }))
              .catch(() => null),
          ),
        );
        if (cancelled) return;

        setUnseen(
          groups.some(
            (entry) =>
              entry?.group != null &&
              millis(entry.group.lastPostAt) > millis(entry.membership.lastSeenAt),
          ),
        );
      } catch {
        // A dot is not worth reporting a failure over.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return unseen;
}
