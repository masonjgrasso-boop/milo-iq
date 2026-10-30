// Loading a span of days for the week and month dashboards, with the gaps
// filled in so a missed day is visible rather than simply absent.

import { useEffect, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { emptyDay, listDays } from '../data/days';
import { rangeKeys, type DayKey } from '../lib/dates';
import type { DayLog } from '../lib/types';

export function useDayRange(from: DayKey, to: DayKey) {
  const { user } = useAuth();
  const uid = user?.uid;

  const [days, setDays] = useState<DayLog[] | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    setDays(null);
    listDays(uid, from, to).then((loaded) => {
      if (cancelled) return;
      const byDate = new Map(loaded.map((day) => [day.date, day]));
      setDays(rangeKeys(from, to).map((key) => byDate.get(key) ?? emptyDay(key)));
    });
    return () => {
      cancelled = true;
    };
  }, [uid, from, to]);

  return { days, loading: days === null };
}
