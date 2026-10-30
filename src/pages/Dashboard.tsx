import { useAuth } from '../context/auth-context';
import { signOutUser } from '../lib/auth';
import { formatHeight, formatWeight } from '../lib/units';
import { ACTIVITY_LABELS } from '../lib/targets';
import { Button, Card } from '../components/ui';

const GOAL_LABELS = {
  lose: 'Losing weight',
  maintain: 'Maintaining',
  gain: 'Gaining weight',
} as const;

export function Dashboard() {
  const { user, profile } = useAuth();
  if (!profile) return null;

  const firstName = user?.displayName?.split(' ')[0];

  return (
    <div className="mx-auto max-w-md px-5 py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {firstName ? `Hi, ${firstName}` : 'Welcome'}
          </h1>
          <p className="mt-1 text-slate-600">{GOAL_LABELS[profile.goal]}</p>
        </div>
        <img src="/icon-192.png" alt="" className="h-10 w-10 rounded-xl" />
      </header>

      <Card className="mt-6 border-brand-200 bg-brand-50">
        <p className="text-sm font-medium text-brand-700">Daily calorie target</p>
        <p className="mt-1 text-4xl font-bold text-brand-700">
          {profile.calorieTarget.toLocaleString()}{' '}
          <span className="text-lg font-semibold">cal</span>
        </p>
      </Card>

      <Card className="mt-4">
        <h2 className="text-sm font-semibold text-slate-900">Your profile</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Height" value={formatHeight(profile.heightCm, profile.units)} />
          <Row label="Weight" value={formatWeight(profile.weightKg, profile.units)} />
          <Row label="Age" value={`${profile.age}`} />
          <Row label="Activity" value={ACTIVITY_LABELS[profile.activity]} />
        </dl>
      </Card>

      <Card className="mt-4">
        <h2 className="text-sm font-semibold text-slate-900">Coming next</h2>
        <p className="mt-2 text-sm text-slate-600">
          Food and weight logging land in the next phase. Your account and profile are
          ready to go.
        </p>
      </Card>

      <div className="mt-8">
        <Button variant="secondary" onClick={() => signOutUser()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}
