import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { signOutUser } from '../lib/auth';
import { formatHeight, formatWeight } from '../lib/units';
import { ACTIVITY_LABELS } from '../lib/targets';
import { GOAL_WORDS } from '../lib/goals';
import { Button, Card, Divider } from '../components/ui';
import { Page } from '../components/Layout';

/** Everything that is not the profile itself, as one grouped list. */
const LINKS = [
  {
    to: '/goals',
    title: 'Goals',
    sub: 'Change what you are aiming for, and at what pace',
  },
  {
    to: '/maintenance',
    title: 'Maintenance',
    sub: 'What your body actually burns, measured from your own logs',
  },
  {
    to: '/groups',
    title: 'Groups',
    sub: 'Share only what you choose, with people you choose',
  },
  {
    to: '/account',
    title: 'Your data',
    sub: 'Export everything, or delete your account',
  },
];

export function More() {
  const { user, profile } = useAuth();
  if (!profile) return null;

  const who = user?.email ?? user?.displayName ?? '—';

  return (
    <Page title="More">
      <Card className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="display flex h-11 w-11 shrink-0 items-center justify-center
              rounded-full bg-brand text-xl text-white"
          >
            {who.charAt(0).toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-base font-extrabold text-ink">Your profile</span>
            <span className="truncate text-[13px] text-ink-mute">{who}</span>
          </span>
        </div>

        <dl className="flex flex-col">
          <Row label="Goal" value={GOAL_WORDS[profile.goal].label} />
          <Row label="Daily target" value={`${profile.calorieTarget.toLocaleString()} cal`} />
          <Row label="Height" value={formatHeight(profile.heightCm, profile.units)} />
          <Row label="Starting weight" value={formatWeight(profile.weightKg, profile.units)} />
          <Row label="Age" value={String(profile.age)} />
          <Row label="Activity" value={ACTIVITY_LABELS[profile.activity]} />
        </dl>
      </Card>

      {/* One card, not three: these are a menu, and three separate cards made
          them read as three unrelated features. */}
      <Card className="flex flex-col overflow-hidden p-0">
        {LINKS.map((link, index) => (
          <div key={link.to}>
            {index > 0 && <Divider />}
            <Link
              to={link.to}
              className="flex items-center justify-between gap-3 px-[18px] py-4 transition hover:bg-muted"
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-extrabold text-ink">{link.title}</span>
                <span className="text-[13px] text-ink-mute">{link.sub}</span>
              </span>
              <span aria-hidden="true" className="font-extrabold text-brand">
                &rarr;
              </span>
            </Link>
          </div>
        ))}
      </Card>

      <Button variant="secondary" onClick={() => signOutUser()}>
        Sign out
      </Button>

      <p className="flex justify-center gap-6 text-[13px] font-bold">
        <Link to="/privacy" className="text-ink-mute hover:text-ink-soft">Privacy</Link>
        <Link to="/terms" className="text-ink-mute hover:text-ink-soft">Terms</Link>
        <a
          href="https://github.com/masonjgrasso-boop/milo-iq"
          target="_blank"
          rel="noreferrer"
          className="text-ink-mute hover:text-ink-soft"
        >
          Source code
        </a>
      </p>

      <img
        src="/milo-script.png"
        alt=""
        className="mt-1 w-24 self-center opacity-25"
      />
    </Page>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-t border-line-soft py-2.5 text-sm">
      <dt className="shrink-0 text-ink-mute">{label}</dt>
      <dd className="truncate text-right font-bold text-ink">{value}</dd>
    </div>
  );
}
