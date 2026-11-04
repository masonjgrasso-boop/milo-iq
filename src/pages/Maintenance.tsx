// Your real maintenance, on its own page.
//
// It used to sit on Trends, but Trends is now one question and one answer. The
// measured number, its confidence and the "use this target" offer belong
// somewhere you go deliberately.

import { useMemo } from 'react';
import { useAuth } from '../context/auth-context';
import { useDayRange } from '../hooks/useDayRange';
import { useMaintenanceBasis } from '../hooks/useMaintenanceBasis';
import { addDays, todayKey } from '../lib/dates';
import { MAX_WINDOW_DAYS } from '../lib/maintenance';
import type { UserProfile } from '../lib/types';
import { MaintenanceCard } from '../components/MaintenanceCard';
import { Page } from '../components/Layout';

export function Maintenance() {
  const { profile } = useAuth();
  if (!profile) return null;
  return (
    <Page eyebrow="Measured" title="Maintenance">
      <Body profile={profile} />
    </Page>
  );
}

function Body({ profile }: { profile: UserProfile }) {
  const today = todayKey();
  const from = useMemo(() => addDays(today, -(MAX_WINDOW_DAYS - 1)), [today]);
  const { days } = useDayRange(from, today);
  const { result, latestWeightKg } = useMaintenanceBasis(days, profile);

  return <MaintenanceCard result={result} latestWeightKg={latestWeightKg} />;
}
