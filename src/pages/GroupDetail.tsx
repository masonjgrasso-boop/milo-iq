import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import {
  addNote, getGroup, getSharedSummary, leaveGroup, listMembers, listNotes,
  publishShare, updateShareFlags,
  type CoachNote, type Group, type GroupMember,
} from '../data/groups';
import { listDays } from '../data/days';
import { listRules } from '../data/rules';
import { listExercises } from '../data/workouts';
import { listPhotos } from '../data/photos';
import {
  buildSharedSummary, SHARE_DESCRIPTIONS, SHARE_KEYS, SHARE_LABELS,
  type ShareFlags, type ShareKey, type SharedSummary,
} from '../lib/groups';
import { displayNameFor } from '../lib/display';
import { addDays, friendlyDayLabel, todayKey, weekKeyLabel } from '../lib/dates';
import { fromKg, weightUnitLabel } from '../lib/units';
import { Button, Card } from '../components/ui';
import { Page } from '../components/Layout';

export function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [summaries, setSummaries] = useState<Record<string, SharedSummary | null>>({});
  const [notes, setNotes] = useState<CoachNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [missing, setMissing] = useState(false);

  const me = members.find((member) => member.uid === user?.uid) ?? null;
  const isCoach = group?.coachUid === user?.uid;

  const load = useCallback(async () => {
    if (!groupId) return;
    const found = await getGroup(groupId);
    if (!found) {
      setMissing(true);
      setLoading(false);
      return;
    }
    const list = await listMembers(groupId);
    setGroup(found);
    setMembers(list);

    const entries = await Promise.all(
      list.map(async (member) => [member.uid, await getSharedSummary(groupId, member.uid)] as const),
    );
    setSummaries(Object.fromEntries(entries));

    if (found.coachUid === user?.uid) setNotes(await listNotes(groupId));
    setLoading(false);
  }, [groupId, user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Rebuilds and republishes the mirror from scratch. Always a full rebuild,
   * so a section the member has just stopped sharing actually disappears.
   */
  const republish = useCallback(
    async (flags: ShareFlags) => {
      if (!user || !groupId || !profile) return;
      setPublishing(true);
      const today = todayKey();

      const [days, rules, exercises, photos] = await Promise.all([
        listDays(user.uid, addDays(today, -27), today),
        listRules(user.uid),
        listExercises(user.uid),
        flags.photos ? listPhotos(user.uid, 8) : Promise.resolve([]),
      ]);

      const summary = buildSharedSummary({
        uid: user.uid,
        displayName: displayNameFor(user),
        flags,
        days,
        today,
        targetCalories: profile.calorieTarget,
        units: profile.units,
        rules,
        exercises,
        photos: photos.map((photo) => ({ week: photo.week, thumbUrl: photo.thumbUrl })),
      });

      await publishShare(user.uid, groupId, summary);
      setSummaries((current) => ({ ...current, [user.uid]: summary }));
      setPublishing(false);
    },
    [user, groupId, profile],
  );

  async function toggleShare(key: ShareKey) {
    if (!user || !groupId || !me) return;
    const flags = { ...me.shareFlags, [key]: !me.shareFlags[key] };
    setMembers((current) =>
      current.map((member) =>
        member.uid === user.uid ? { ...member, shareFlags: flags } : member,
      ),
    );
    await updateShareFlags(user.uid, groupId, flags);
    await republish(flags);
  }

  async function handleLeave() {
    if (!user || !groupId) return;
    await leaveGroup(user.uid, groupId);
    navigate('/groups', { replace: true });
  }

  if (loading) {
    return (
      <Page title="Loading…">
        <Card>
          <p className="text-sm text-slate-400">One moment…</p>
        </Card>
      </Page>
    );
  }

  if (missing || !group) {
    return (
      <Page title="Not found">
        <Card>
          <p className="text-sm text-slate-600">
            That group no longer exists, or you are no longer a member.
          </p>
          <Link to="/groups" className="mt-3 inline-block text-sm font-semibold text-brand-600">
            Back to groups
          </Link>
        </Card>
      </Page>
    );
  }

  const others = members.filter((member) => member.uid !== user?.uid);

  return (
    <Page title={group.name}>
      <Link
        to="/groups"
        className="mb-4 inline-block text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        &larr; All groups
      </Link>

      <Card className="bg-slate-50">
        <p className="text-xs font-medium text-slate-500">Invite code</p>
        <p className="mt-1 font-mono text-2xl tracking-widest text-slate-900">
          {group.inviteCode}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Anyone with this code can join. {members.length}{' '}
          {members.length === 1 ? 'member' : 'members'}.
        </p>
      </Card>

      <h2 className="mt-6 mb-2 text-sm font-semibold text-slate-900">What you share here</h2>
      <Card>
        <ul className="divide-y divide-slate-100">
          {SHARE_KEYS.map((key) => (
            <li key={key} className="py-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={me?.shareFlags[key] ?? false}
                  onChange={() => toggleShare(key)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-brand-600"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">
                    {SHARE_LABELS[key]}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {SHARE_DESCRIPTIONS[key]}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Unticking something removes it from this group straight away. Anything you do not
          tick is never written anywhere the group can read.
          {publishing && <span className="ml-1 text-brand-600">Updating…</span>}
        </p>
      </Card>

      <h2 className="mt-6 mb-2 text-sm font-semibold text-slate-900">
        {isCoach ? 'Your members' : 'The group'}
      </h2>

      {others.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            Nobody else has joined yet. Send them the code above.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {others.map((member) => (
            <MemberCard
              key={member.uid}
              member={member}
              summary={summaries[member.uid] ?? null}
              units={profile?.units ?? 'metric'}
              isCoach={isCoach}
              notes={notes.filter((note) => note.memberUid === member.uid)}
              onAddNote={async (text) => {
                if (!user || !groupId) return;
                await addNote(groupId, user.uid, member.uid, text);
                setNotes(await listNotes(groupId));
              }}
            />
          ))}
        </div>
      )}

      <div className="mt-8">
        <Button variant="secondary" onClick={handleLeave}>
          Leave this group
        </Button>
        <p className="mt-2 text-center text-xs text-slate-500">
          Leaving deletes what you shared here and ends their access immediately.
        </p>
      </div>
    </Page>
  );
}

function MemberCard({ member, summary, units, isCoach, notes, onAddNote }: {
  member: GroupMember;
  summary: SharedSummary | null;
  units: 'imperial' | 'metric';
  isCoach: boolean;
  notes: CoachNote[];
  onAddNote: (text: string) => Promise<void>;
}) {
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const unit = weightUnitLabel(units);

  const shared = summary
    ? SHARE_KEYS.filter((key) => summary[key] !== undefined)
    : [];

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-slate-900">{member.displayName}</h3>
        {member.role === 'coach' && (
          <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-medium text-brand-700">
            Coach
          </span>
        )}
      </div>

      {shared.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          Not sharing anything with this group yet.
        </p>
      ) : (
        <dl className="mt-3 space-y-2.5 text-sm">
          {summary?.calories && (
            <div>
              <dt className="text-xs font-medium text-slate-500">Calories this week</dt>
              <dd className="text-slate-900">
                {summary.calories.avgIntake.toLocaleString()} avg against a target of{' '}
                {summary.calories.target.toLocaleString()} &middot;{' '}
                {summary.calories.daysLogged} days logged
              </dd>
            </div>
          )}

          {summary?.weight && (
            <div>
              <dt className="text-xs font-medium text-slate-500">Weight trend</dt>
              <dd className="text-slate-900">
                {summary.weight.changeKg === 0
                  ? 'Holding steady'
                  : `${summary.weight.changeKg < 0 ? 'Down' : 'Up'} ${Math.abs(
                      fromKg(summary.weight.changeKg, units),
                    ).toFixed(1)} ${unit} over the last four weeks`}
              </dd>
            </div>
          )}

          {summary?.workouts && (
            <div>
              <dt className="text-xs font-medium text-slate-500">Workouts</dt>
              <dd className="text-slate-900">
                {summary.workouts.sessionsThisWeek} this week
                {summary.workouts.lastDate &&
                  ` · last ${friendlyDayLabel(summary.workouts.lastDate).toLowerCase()}`}
                {summary.workouts.topLifts.length > 0 && (
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {summary.workouts.topLifts
                      .map(
                        (lift) =>
                          `${lift.name} ${fromKg(lift.e1rmKg, units).toFixed(0)}${unit}`,
                      )
                      .join(' · ')}
                  </span>
                )}
              </dd>
            </div>
          )}

          {summary?.rules && summary.rules.length > 0 && (
            <div>
              <dt className="text-xs font-medium text-slate-500">Rules</dt>
              <dd className="space-y-0.5 text-slate-900">
                {summary.rules.map((rule) => (
                  <span key={rule.name} className="block">
                    {rule.name} &middot;{' '}
                    <span className="font-medium text-brand-600">{rule.streak}</span> streak
                    <span className="text-xs text-slate-500"> ({rule.detail})</span>
                  </span>
                ))}
              </dd>
            </div>
          )}

          {summary?.photos && summary.photos.length > 0 && (
            <div>
              <dt className="text-xs font-medium text-slate-500">Progress photos</dt>
              <dd className="mt-1 flex gap-2 overflow-x-auto">
                {summary.photos.map((photo) => (
                  <img
                    key={photo.week}
                    src={photo.thumbUrl}
                    alt={`${member.displayName}, ${weekKeyLabel(photo.week)}`}
                    className="h-20 w-15 shrink-0 rounded-lg object-cover"
                    loading="lazy"
                  />
                ))}
              </dd>
            </div>
          )}
        </dl>
      )}

      {isCoach && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          {notes.length > 0 && (
            <ul className="mb-3 space-y-2">
              {notes.map((note) => (
                <li key={note.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {note.text}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder="Leave a note"
              className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm
                text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
            <button
              type="button"
              disabled={!noteText.trim() || saving}
              onClick={async () => {
                setSaving(true);
                await onAddNote(noteText.trim());
                setNoteText('');
                setSaving(false);
              }}
              className="shrink-0 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold
                text-white disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
