// The maintenance figure every Trends number is measured against, derived from
// day logs the caller has already loaded so it costs no extra reads.

import { useMemo } from 'react';
import { todayKey } from '../lib/dates';
import { estimateMaintenance } from '../lib/maintenance';
import { maintenanceBasis } from '../lib/pace';
import { latestTrend, trendSeries } from '../lib/trend';
import type { DayLog, UserProfile } from '../lib/types';

export function useMaintenanceBasis(days: DayLog[] | null, profile: UserProfile) {
  const today = todayKey();

  return useMemo(() => {
    const result = estimateMaintenance(days ?? [], today);
    // The onboarding weight goes stale, so the fallback estimate uses the
    // current trend weight when there is one.
    const latestWeightKg = latestTrend(trendSeries(days ?? [])) ?? undefined;
    return {
      result,
      latestWeightKg,
      basis: maintenanceBasis(result, profile, latestWeightKg),
    };
  }, [days, today, profile]);
}
