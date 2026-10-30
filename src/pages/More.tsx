import { useAuth } from '../context/auth-context';
import { signOutUser } from '../lib/auth';
import { formatHeight, formatWeight } from '../lib/units';
import { ACTIVITY_LABELS } from '../lib/targets';
import { Button, Card } from '../components/ui';
import { Page } from '../components/Layout';

const GOAL_LABELS = {
  lose: 'Losing weight',
  maintain: 'Maintaining',
  gain: 'Gaining weight',
} as const;

export function More() {
  const { user, profile } = useAuth();
  if (!profile) return null;

  return (
    <Page title="More">
      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Your profile</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Signed in as" value={user?.email ?? user?.displayName ?? '—'} />
          <Row label="Goal" value={GOAL_LABELS[profile.goal]} />
          <Row label="Daily target" value={`${profile.calorieTarget.toLocaleString()} cal`} />
          <Row label="Height" value={formatHeight(profile.heightCm, profile.units)} />
          <Row label="Starting weight" value={formatWeight(profile.weightKg, profile.units)} />
          <Row label="Age" value={String(profile.age)} />
          <Row label="Activity" value={ACTIVITY_LABELS[profile.activity]} />
        </dl>
      </Card>

      <div className="mt-6">
        <Button variant="secondary" onClick={() => signOutUser()}>
          Sign out
        </Button>
      </div>
    </Page>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="truncate font-medium text-slate-900">{value}</dd>
    </div>
  );
}
