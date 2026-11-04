import { Link } from 'react-router-dom';
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
        <h2 className="text-sm font-semibold text-ink">Your profile</h2>
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

      <Card className="mt-4">
        <Link to="/maintenance" className="flex items-center justify-between">
          <span>
            <span className="block text-sm font-semibold text-ink">Maintenance</span>
            <span className="block text-xs text-ink-mute">
              What your body actually burns, measured from your own logs
            </span>
          </span>
          <span aria-hidden="true" className="text-ink-ghost">&rarr;</span>
        </Link>
      </Card>

      <Card className="mt-3">
        <Link to="/groups" className="flex items-center justify-between">
          <span>
            <span className="block text-sm font-semibold text-ink">Groups</span>
            <span className="block text-xs text-ink-mute">
              Share only what you choose, with people you choose
            </span>
          </span>
          <span aria-hidden="true" className="text-ink-ghost">&rarr;</span>
        </Link>
      </Card>

      <Card className="mt-3">
        <Link to="/account" className="flex items-center justify-between">
          <span>
            <span className="block text-sm font-semibold text-ink">Your data</span>
            <span className="block text-xs text-ink-mute">
              Export everything, or delete your account
            </span>
          </span>
          <span aria-hidden="true" className="text-ink-ghost">&rarr;</span>
        </Link>
      </Card>

      <div className="mt-6">
        <Button variant="secondary" onClick={() => signOutUser()}>
          Sign out
        </Button>
      </div>
      <p className="mt-6 flex justify-center gap-6 text-sm">
        <Link to="/privacy" className="font-medium text-ink-mute hover:text-ink-soft">
          Privacy
        </Link>
        <Link to="/terms" className="font-medium text-ink-mute hover:text-ink-soft">
          Terms
        </Link>
      </p>
    </Page>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-ink-mute">{label}</dt>
      <dd className="truncate font-medium text-ink">{value}</dd>
    </div>
  );
}
