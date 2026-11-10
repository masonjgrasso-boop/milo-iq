// The groups you are in, and the two ways to get into another one.
//
// Creating and joining both pass through the same sharing question before
// anything is written. That ordering is the point: somebody should decide
// what a group can see about them before they are in it, not discover a
// settings tab afterwards and hope they got there first.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { createGroup, joinGroup, listMyGroups, JoinError, type Membership } from '../data/groups';
import {
  isValidInviteCode, DEFAULT_SHARING, JOIN_SHARE_KEYS,
  type ShareFlags, type ShareKey,
} from '../lib/groups';
import { displayNameFor } from '../lib/display';
import { Button, Card, Field, TextInput } from '../components/ui';
import { ShareChoices } from '../components/ShareChoices';
import { Page } from '../components/Layout';

/** Name or code first, then the sharing question, then it happens. */
type Mode = 'none' | 'create' | 'join' | 'sharing';

export function Groups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Membership[] | null>(null);
  const [mode, setMode] = useState<Mode>('none');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [flags, setFlags] = useState<ShareFlags>({ ...DEFAULT_SHARING });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Which of the two the sharing screen is going to finish. */
  const [pending, setPending] = useState<'create' | 'join'>('create');

  useEffect(() => {
    if (user) listMyGroups(user.uid).then(setGroups);
  }, [user]);

  function reset() {
    setMode('none');
    setName('');
    setCode('');
    setFlags({ ...DEFAULT_SHARING });
    setError(null);
  }

  function askAboutSharing(next: 'create' | 'join') {
    setPending(next);
    setMode('sharing');
  }

  async function finish() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      if (pending === 'create') {
        const group = await createGroup(
          user.uid, displayNameFor(user), name.trim(), flags, user.photoURL ?? undefined,
        );
        setGroups((current) => [
          ...(current ?? []),
          { groupId: group.id, name: group.name, role: 'admin', shareFlags: flags },
        ]);
      } else {
        const group = await joinGroup(
          user.uid, displayNameFor(user), code, flags, user.photoURL ?? undefined,
        );
        setGroups((current) => {
          const already = (current ?? []).some((item) => item.groupId === group.id);
          return already
            ? current
            : [
                ...(current ?? []),
                { groupId: group.id, name: group.name, role: 'member', shareFlags: flags },
              ];
        });
      }
      reset();
    } catch (err) {
      setError(
        err instanceof JoinError
          ? err.message
          : pending === 'create'
            ? 'Could not create the group. Check your connection and try again.'
            : 'Could not join. Check the code and your connection.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      eyebrow="Together"
      title="Groups"
      subtitle="Share only what you choose. Leave whenever you like."
    >
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
        <div className="flex flex-col gap-2">
          {groups.map((membership) => (
            <Link
              key={membership.groupId}
              to={`/groups/${membership.groupId}`}
              className="flex items-center justify-between gap-3 rounded-card border border-line
                bg-surface px-4 py-3 shadow-card transition hover:border-brand"
            >
              <span className="min-w-0">
                <span className="block truncate font-bold text-ink">{membership.name}</span>
                {membership.role === 'admin' && (
                  <span className="block text-xs font-bold text-brand">Admin</span>
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
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {mode === 'create' && (
        <Card className="flex flex-col gap-4">
          <Field label="Group name">
            <TextInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Thursday lifting crew"
            />
          </Field>
          <p className="text-xs text-ink-mute">
            You will be its admin: you can invite people, remove them, and rename or delete
            the group. You see exactly what every other member sees.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={reset}>
              Cancel
            </Button>
            <Button onClick={() => askAboutSharing('create')} disabled={!name.trim()}>
              Next
            </Button>
          </div>
        </Card>
      )}

      {mode === 'join' && (
        <Card className="flex flex-col gap-4">
          <Field label="Invite code" hint="Six characters, from whoever runs the group.">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="AB3K9P"
              maxLength={8}
              autoCapitalize="characters"
              aria-label="Invite code"
              className="w-full rounded-input border border-line-in px-3 py-2.5 text-center
                font-mono text-lg tracking-widest text-ink outline-none
                focus:border-brand focus:ring-2 focus:ring-brand-pill"
            />
          </Field>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={reset}>
              Cancel
            </Button>
            <Button
              onClick={() => askAboutSharing('join')}
              disabled={!isValidInviteCode(code)}
            >
              Next
            </Button>
          </div>
        </Card>
      )}

      {mode === 'sharing' && (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] font-extrabold leading-snug text-ink">
              What do you want to share with this group?
            </h2>
            <p className="text-[13px] text-ink-mute">
              {pending === 'create' ? name.trim() : `Code ${code}`} &middot; you can change
              any of this later, and unticking something removes it straight away.
            </p>
          </div>

          <ShareChoices
            flags={flags}
            keys={JOIN_SHARE_KEYS}
            onToggle={(key: ShareKey) =>
              setFlags((current) => ({ ...current, [key]: !current[key] }))
            }
          />

          <p className="text-xs text-ink-faint">
            Tick nothing and you can still read the feed, post, and comment — the group
            just sees no numbers of yours.
          </p>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setMode(pending)}
              disabled={busy}
            >
              Back
            </Button>
            <Button onClick={finish} disabled={busy}>
              {busy
                ? pending === 'create' ? 'Creating…' : 'Joining…'
                : pending === 'create' ? 'Create group' : 'Join'}
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
    </Page>
  );
}
