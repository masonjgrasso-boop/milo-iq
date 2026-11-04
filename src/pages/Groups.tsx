import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { createGroup, joinGroup, listMyGroups, JoinError, type Membership } from '../data/groups';
import { isValidInviteCode } from '../lib/groups';
import { displayNameFor } from '../lib/display';
import { Button, Card, Field, TextInput } from '../components/ui';
import { Page } from '../components/Layout';

type Mode = 'none' | 'create' | 'join';

export function Groups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Membership[] | null>(null);
  const [mode, setMode] = useState<Mode>('none');
  const [name, setName] = useState('');
  const [asCoach, setAsCoach] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) listMyGroups(user.uid).then(setGroups);
  }, [user]);

  async function handleCreate() {
    if (!user || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const group = await createGroup(user.uid, displayNameFor(user), name.trim(), asCoach);
      setGroups((current) => [
        ...(current ?? []),
        { groupId: group.id, name: group.name, role: asCoach ? 'coach' : 'member' },
      ]);
      setName('');
      setMode('none');
    } catch {
      setError('Could not create the group. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (!user || !isValidInviteCode(code)) return;
    setBusy(true);
    setError(null);
    try {
      const group = await joinGroup(user.uid, displayNameFor(user), code);
      setGroups((current) => {
        const already = (current ?? []).some((item) => item.groupId === group.id);
        return already
          ? current
          : [...(current ?? []), { groupId: group.id, name: group.name, role: 'member' }];
      });
      setCode('');
      setMode('none');
    } catch (err) {
      setError(
        err instanceof JoinError
          ? err.message
          : 'Could not join. Check the code and your connection.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page eyebrow="Together" title="Groups" subtitle="Share only what you choose. Leave whenever you like.">
      <Link
        to="/more"
        className="mb-4 inline-block text-sm font-medium text-ink-mute hover:text-ink-soft"
      >
        &larr; Back
      </Link>

      {groups === null ? (
        <Card>
          <p className="text-sm text-ink-ghost">Loading…</p>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-soft">
            You are not in any groups. A group is a handful of people who can see whichever
            parts of your progress you decide to share — nothing is shared by default.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.map((membership) => (
            <Link
              key={membership.groupId}
              to={`/groups/${membership.groupId}`}
              className="flex items-center justify-between gap-3 rounded-card border border-line
                bg-surface px-4 py-3 shadow-card transition hover:border-brand"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">
                  {membership.name}
                </span>
                {membership.role === 'coach' && (
                  <span className="block text-xs font-medium text-brand">Coach</span>
                )}
              </span>
              <span aria-hidden="true" className="shrink-0 text-ink-ghost">
                &rarr;
              </span>
            </Link>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-6 space-y-3">
        {mode === 'create' && (
          <Card className="space-y-4">
            <Field label="Group name">
              <TextInput
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Thursday lifting crew"
              />
            </Field>
            <label className="flex items-start gap-2.5 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={asCoach}
                onChange={(event) => setAsCoach(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-line-in accent-brand"
              />
              <span>
                I am coaching this group
                <span className="block text-xs text-ink-mute">
                  Coaches can leave notes on each member&rsquo;s shared data.
                </span>
              </span>
            </label>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setMode('none')}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!name.trim() || busy}>
                {busy ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </Card>
        )}

        {mode === 'join' && (
          <Card className="space-y-4">
            <Field label="Invite code" hint="Six characters, from whoever runs the group.">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="AB3K9P"
                maxLength={8}
                autoCapitalize="characters"
                className="w-full rounded-input border border-line-in px-3 py-2.5 text-center
                  font-mono text-lg tracking-widest text-ink outline-none
                  focus:border-brand focus:ring-2 focus:ring-brand-pill"
              />
            </Field>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setMode('none')}>
                Cancel
              </Button>
              <Button onClick={handleJoin} disabled={!isValidInviteCode(code) || busy}>
                {busy ? 'Joining…' : 'Join'}
              </Button>
            </div>
          </Card>
        )}

        {mode === 'none' && (
          <div className="flex gap-3">
            <Button onClick={() => setMode('create')}>Create a group</Button>
            <Button variant="secondary" onClick={() => setMode('join')}>
              Join with a code
            </Button>
          </div>
        )}
      </div>
    </Page>
  );
}
