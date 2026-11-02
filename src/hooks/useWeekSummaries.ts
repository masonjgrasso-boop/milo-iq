// Loading the precomputed weekly roll-ups for the year view, so a year of
// trend costs about 53 small documents rather than 365 day logs.

import { useEffect, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { listWeekSummaries } from '../data/summaries';
import type { PeriodSummary } from '../lib/types';

export function useWeekSummaries(fromWeek: string, toWeek: string) {
  const { user } = useAuth();
  const uid = user?.uid;

  const [weeks, setWeeks] = useState<PeriodSummary[] | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    setWeeks(null);
    listWeekSummaries(uid, fromWeek, toWeek).then((loaded) => {
      if (!cancelled) setWeeks(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [uid, fromWeek, toWeek]);

  return { weeks, loading: weeks === null };
}
