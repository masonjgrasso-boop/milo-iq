// The nudges waiting for you.
//
// There are no push notifications here, so a nudge is something you find
// rather than something that finds you: one query on app open, and a banner
// at the top of Today until you have read it.
//
// The query is a collection group across every group's nudges, which costs
// the same whether somebody is in one group or six. The security rule on
// that path grants a document only when its recipient is the reader, so the
// filter below is what makes the query legal at all rather than merely
// narrowing it.

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { listMyNudges, markNudgeSeen } from '../data/posts';
import type { Nudge } from '../lib/feed';

export function useNudges() {
  const { user } = useAuth();
  const [nudges, setNudges] = useState<Nudge[]>([]);

  useEffect(() => {
    if (!user) {
      setNudges([]);
      return;
    }
    let cancelled = false;
    listMyNudges(user.uid)
      .then((found) => {
        if (!cancelled) setNudges(found);
      })
      // A missing index or a network blip must not break the screen a nudge
      // happens to sit on.
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [user]);

  const dismiss = useCallback(async (nudge: Nudge) => {
    setNudges((current) => current.filter((item) => item.id !== nudge.id));
    await markNudgeSeen(nudge.groupId, nudge.id).catch(() => undefined);
  }, []);

  return { nudges, dismiss };
}
