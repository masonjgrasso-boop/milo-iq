// The dot on the Rules tab.
//
// This is the one place in the app that uses live listeners rather than
// one-off reads, and it earns them: the dot has to vanish the instant the last
// box is ticked on the Rules tab, and two independent reads of the same day
// document would leave the tab bar showing yesterday's answer until you
// navigated. A listener is billed only when something changes.
//
// Midnight needs no special handling — `todayKey()` rolls over, the listener
// moves to the new day's document, and that document is empty.

import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/auth-context';
import { dayRef } from '../data/days';
import { rulesCollection } from '../data/rules';
import { todayKey } from '../lib/dates';
import { shouldRemind } from '../lib/rules';
import type { DayLog, Rule } from '../lib/types';

/** How often the clock is re-read, so six o'clock arrives without a reload. */
const TICK_MS = 60_000;

export function useRuleReminder(): boolean {
  const { user } = useAuth();
  const uid = user?.uid;

  const [rules, setRules] = useState<Rule[]>([]);
  const [day, setDay] = useState<DayLog | null>(null);
  const [now, setNow] = useState(() => new Date());

  const date = todayKey();

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!uid) return;
    // A failure here means no dot, which is the right way to fail: a reminder
    // is a nicety and must never break the tab bar.
    return onSnapshot(
      rulesCollection(uid),
      (snap) =>
        setRules(
          snap.docs.map((document) => ({ ...(document.data() as Rule), id: document.id })),
        ),
      () => setRules([]),
    );
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      dayRef(uid, date),
      (snap) => setDay(snap.exists() ? (snap.data() as DayLog) : null),
      () => setDay(null),
    );
  }, [uid, date]);

  return shouldRemind(rules, day, date, now);
}
