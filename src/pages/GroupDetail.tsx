// One group: its feed, its members, and what you share with it.
//
// The feed is the screen. Members and Sharing are tabs behind it, because
// the thing people come back for is what everyone has been up to, not a
// settings panel.
//
// Everything a member sees here was published by its owner into this group.
// There is no read-time filtering anywhere in this file: if it is not in the
// mirror or on a post, it was never written where the group could read it.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import {
  deleteGroup, forgetGroup, getGroup, getSharedSummary, leaveGroup, listMembers,
  markGroupSeen, publishShare, removeMember, renameGroup, syncMembershipName,
  touchGroupActivity, transferAdmin, updateShareFlags,
  type Group, type GroupMember,
} from '../data/groups';
import {
  addComment, createPost, deleteAuthorPosts, deleteComment, deletePost, listComments,
  listPosts, nudgesSentToday, pruneAuthorItems, sendNudge, setReactions, uploadPostImage,
  type FeedCursor,
} from '../data/posts';
import { listDays } from '../data/days';
import { listRules } from '../data/rules';
import { listExercises } from '../data/workouts';
import { listPhotos } from '../data/photos';
import {
  buildSharedSummary, daysInactive, isInactive, SHARE_KEYS,
  type ShareFlags, type ShareKey, type SharedSummary,
} from '../lib/groups';
import {
  itemsFor, nudgeId, visiblePosts,
  type FeedComment, type FeedPost, type Reaction,
} from '../lib/feed';
import { displayNameFor } from '../lib/display';
import { addDays, friendlyDayLabel, todayKey, weekKeyLabel } from '../lib/dates';
import { fromKg, weightUnitLabel } from '../lib/units';
import { Button, Card, ConfirmDialog, Eyebrow, Segmented, TextInput } from '../components/ui';
import { useGroupSync } from '../hooks/useGroupSync';
import { ShareChoices } from '../components/ShareChoices';
import { Avatar, PostCard } from '../components/PostCard';
import { PostComposer, type ComposedPost } from '../components/PostComposer';
import { Page } from '../components/Layout';

type Tab = 'feed' | 'members' | 'sharing';

export function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('feed');
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [summaries, setSummaries] = useState<Record<string, SharedSummary | null>>({});
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const me = members.find((member) => member.uid === user?.uid) ?? null;
  const isAdmin = group?.adminUid === user?.uid;
  const memberUids = useMemo(() => members.map((member) => member.uid), [members]);

  const load = useCallback(async () => {
    if (!groupId || !user) return;
    let found: Group | null = null;
    try {
      found = await getGroup(groupId);
    } catch {
      found = null;
    }

    if (!found) {
      // Either the group was deleted or we were removed from it. Both leave a
      // pointer behind under our own user document that only we can clear.
      await forgetGroup(user.uid, groupId).catch(() => undefined);
      setMissing(true);
      setLoading(false);
      return;
    }

    const list = await listMembers(groupId);
    setGroup(found);
    setMembers(list);

    const entries = await Promise.all(
      list.map(async (member) =>
        [member.uid, await getSharedSummary(groupId, member.uid)] as const),
    );
    setSummaries(Object.fromEntries(entries));

    // The admin may have renamed the group since we last looked.
    syncMembershipName(user.uid, groupId, found.name).catch(() => undefined);
    // And looking at it is what clears the dot on the Groups tab.
    markGroupSeen(user.uid, groupId);
    setLoading(false);
  }, [groupId, user]);

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
        goalHistory: profile.goalHistory ?? [],
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

    // Turning a category off takes what it published with it, which is the
    // promise the sharing screen makes. Because one card can carry lines from
    // more than one category, this prunes lines rather than deleting posts:
    // a card left with nothing on it goes, one with a line from another
    // category keeps that line.
    if (!flags[key]) {
      await pruneAuthorItems(groupId, user.uid, itemsFor(key)).catch(() => undefined);
    }

    await republish(flags);
  }

  async function handleLeave() {
    if (!user || !groupId) return;
    // Clear our posts while we still have permission to; the member record is
    // what grants it, and leaving deletes that.
    await deleteAuthorPosts(groupId, user.uid).catch(() => undefined);
    await leaveGroup(user.uid, groupId);
    navigate('/groups', { replace: true });
  }

  if (loading) {
    return (
      <Page title="Loading…">
        <Card>
          <p className="text-sm text-ink-ghost">One moment…</p>
        </Card>
      </Page>
    );
  }

  if (missing || !group || !user) {
    return (
      <Page title="Not found">
        <Card>
          <p className="text-sm text-ink-soft">
            That group no longer exists, or you are no longer a member.
          </p>
          <Link to="/groups" className="mt-3 inline-block text-sm font-bold text-brand">
            Back to groups
          </Link>
        </Card>
      </Page>
    );
  }

  return (
    <Page
      title={group.name}
      eyebrow={`${members.length} ${members.length === 1 ? 'member' : 'members'}`}
      back={
        <Link to="/groups" className="text-[13px] font-bold text-ink-mute hover:text-ink-soft">
          &larr; All groups
        </Link>
      }
    >
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'feed', label: 'Feed' },
          { value: 'members', label: 'Members' },
          { value: 'sharing', label: 'Sharing' },
        ]}
      />

      {tab === 'feed' && (
        <Feed
          groupId={group.id}
          uid={user.uid}
          authorName={displayNameFor(user)}
          authorPhoto={user.photoURL ?? undefined}
          isAdmin={isAdmin}
          members={members}
          memberUids={memberUids}
        />
      )}

      {tab === 'members' && (
        <Members
          group={group}
          members={members}
          summaries={summaries}
          me={user.uid}
          myName={displayNameFor(user)}
          isAdmin={isAdmin}
          units={profile?.units ?? 'metric'}
          onChanged={load}
        />
      )}

      {tab === 'sharing' && (
        <Sharing
          group={group}
          flags={me?.shareFlags}
          publishing={publishing}
          isAdmin={isAdmin}
          members={members}
          onToggle={toggleShare}
          onLeave={handleLeave}
          onChanged={load}
          uid={user.uid}
        />
      )}
    </Page>
  );
}

/* ------------------------------------------------------------------- feed */

function Feed({ groupId, uid, authorName, authorPhoto, isAdmin, members, memberUids }: {
  groupId: string;
  uid: string;
  authorName: string;
  authorPhoto?: string;
  isAdmin: boolean;
  members: GroupMember[];
  memberUids: string[];
}) {
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [cursor, setCursor] = useState<FeedCursor>(null);
  const [more, setMore] = useState(false);
  const [author, setAuthor] = useState<string>('');
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState<Record<string, FeedComment[] | null>>({});
  const [error, setError] = useState<string | null>(null);

  const loadFirst = useCallback(async () => {
    setPosts(null);
    try {
      const page = await listPosts(groupId, { author: author || undefined });
      setPosts(page.posts);
      setCursor(page.cursor);
      setMore(page.more);
    } catch {
      setPosts([]);
      setError('Could not load the feed. Check your connection.');
    }
  }, [groupId, author]);

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  async function loadMore() {
    const page = await listPosts(groupId, { author: author || undefined, after: cursor });
    setPosts((current) => [...(current ?? []), ...page.posts]);
    setCursor(page.cursor);
    setMore(page.more);
  }

  async function post({ body, image }: ComposedPost) {
    setBusy(true);
    setError(null);
    try {
      const created = await createPost(groupId, {
        authorUid: uid,
        authorName,
        ...(authorPhoto ? { authorPhoto } : {}),
        kind: 'note',
        ...(body ? { body } : {}),
      });

      if (image) {
        const urls = await uploadPostImage(uid, created.id, image);
        await createPost(groupId, { ...created, ...urls, kind: 'note' });
        // The placeholder was replaced by one carrying the picture.
        await deletePost(groupId, created.id).catch(() => undefined);
      }

      await touchGroupActivity(groupId);
      setComposing(false);
      await loadFirst();
    } catch {
      setError('Could not post that. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function react(post: FeedPost, reactions: Record<string, Reaction>) {
    setPosts((current) =>
      (current ?? []).map((item) => (item.id === post.id ? { ...item, reactions } : item)),
    );
    await setReactions(groupId, post.id, reactions).catch(() => loadFirst());
  }

  async function remove(post: FeedPost) {
    setPosts((current) => (current ?? []).filter((item) => item.id !== post.id));
    await deletePost(groupId, post.id).catch(() => loadFirst());
  }

  async function openComments(post: FeedPost) {
    setComments((current) => ({ ...current, [post.id]: null }));
    const list = await listComments(groupId, post.id);
    setComments((current) => ({ ...current, [post.id]: list }));
  }

  async function comment(post: FeedPost, text: string) {
    const created = await addComment(groupId, post.id, {
      authorUid: uid,
      authorName,
      text,
    });
    setComments((current) => ({
      ...current,
      [post.id]: [...(current[post.id] ?? []), created],
    }));
  }

  async function removeComment(post: FeedPost, commentId: string) {
    setComments((current) => ({
      ...current,
      [post.id]: (current[post.id] ?? []).filter((item) => item.id !== commentId),
    }));
    await deleteComment(groupId, post.id, commentId).catch(() => openComments(post));
  }

  // The second half of "leaving removes your posts": a delete is a batch and
  // a batch can fail, so the feed also refuses to render anybody who is no
  // longer here.
  const shown = visiblePosts(posts ?? [], memberUids);

  return (
    <>
      {composing ? (
        <PostComposer busy={busy} onPost={post} onCancel={() => setComposing(false)} />
      ) : (
        <Button onClick={() => setComposing(true)}>Post something</Button>
      )}

      {members.length > 1 && (
        <label className="flex items-center gap-2.5 text-[13px] text-ink-mute">
          <span className="shrink-0">Showing</span>
          <select
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            aria-label="Filter the feed by member"
            className="h-10 min-w-0 flex-1 rounded-input border border-line-in bg-surface px-2.5
              text-sm font-bold text-ink outline-none focus:border-brand"
          >
            <option value="">Everyone</option>
            {members.map((member) => (
              <option key={member.uid} value={member.uid}>
                {member.uid === uid ? 'Me' : member.displayName}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {posts === null ? (
        <Card>
          <p className="py-8 text-center text-sm text-ink-ghost">Loading…</p>
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-ink-soft">
            Nothing here yet. Log a day, finish a workout, or write something.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              uid={uid}
              canModerate={post.authorUid === uid || isAdmin}
              comments={comments[post.id] ?? null}
              onReact={(reactions) => react(post, reactions)}
              onDelete={() => remove(post)}
              onLoadComments={() => openComments(post)}
              onComment={(text) => comment(post, text)}
              onDeleteComment={(commentId) => removeComment(post, commentId)}
            />
          ))}
        </div>
      )}

      {more && (
        <Button variant="secondary" onClick={loadMore}>
          Load more
        </Button>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- members */

function Members({
  group, members, summaries, me, myName, isAdmin, units, onChanged,
}: {
  group: Group;
  members: GroupMember[];
  summaries: Record<string, SharedSummary | null>;
  me: string;
  myName: string;
  isAdmin: boolean;
  units: 'imperial' | 'metric';
  onChanged: () => void;
}) {
  const today = todayKey();
  const [nudged, setNudged] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<GroupMember | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    nudgesSentToday(group.id, today).then(setNudged).catch(() => undefined);
  }, [group.id, today]);

  async function nudge(member: GroupMember) {
    // Optimistic: the button's job is to stop a second tap, and the rules
    // refuse a second nudge today even if one gets through.
    setNudged((current) => new Set(current).add(member.uid));
    await sendNudge(
      group.id,
      {
        groupId: group.id,
        groupName: group.name,
        fromUid: me,
        fromName: myName,
        toUid: member.uid,
        day: today,
      },
      nudgeId(member.uid, today),
    ).catch(() => undefined);
  }

  async function confirmRemove() {
    if (!removing) return;
    setBusy(true);
    await deleteAuthorPosts(group.id, removing.uid).catch(() => undefined);
    await removeMember(group.id, removing.uid);
    setBusy(false);
    setRemoving(null);
    onChanged();
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {members.map((member) => (
          <MemberCard
            key={member.uid}
            member={member}
            summary={summaries[member.uid] ?? null}
            units={units}
            isMe={member.uid === me}
            today={today}
            canRemove={isAdmin && member.uid !== me}
            nudgedToday={nudged.has(member.uid)}
            onNudge={() => nudge(member)}
            onRemove={() => setRemoving(member)}
          />
        ))}
      </div>

      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.displayName}?`}
          confirmLabel="Remove"
          busy={busy}
          onConfirm={confirmRemove}
          onCancel={() => setRemoving(null)}
        >
          <p>
            Their posts and everything they shared here go with them. They keep all of
            their own logs; nothing of theirs is deleted.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}

function MemberCard({
  member, summary, units, isMe, today, canRemove, nudgedToday, onNudge, onRemove,
}: {
  member: GroupMember;
  summary: SharedSummary | null;
  units: 'imperial' | 'metric';
  isMe: boolean;
  today: string;
  canRemove: boolean;
  nudgedToday: boolean;
  onNudge: () => void;
  onRemove: () => void;
}) {
  const unit = weightUnitLabel(units);
  const shared = summary ? SHARE_KEYS.filter((key) => summary[key as keyof SharedSummary] !== undefined) : [];
  const quiet = isInactive(summary?.lastLoggedDay, today);
  const gap = daysInactive(summary?.lastLoggedDay, today);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <Avatar name={member.displayName} photo={member.photoURL} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-extrabold text-ink">
            {member.displayName}
            {isMe && <span className="ml-1.5 text-xs font-bold text-ink-faint">You</span>}
          </span>
          {member.role === 'admin' && (
            <span className="text-xs font-bold text-brand">Admin</span>
          )}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded-chip px-2.5 py-1.5 text-xs font-bold text-ink-off
              transition hover:text-danger"
          >
            Remove
          </button>
        )}
      </div>

      {quiet && !isMe && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-input bg-cream px-3 py-2.5">
          <span className="text-[13px] text-ink-soft">
            Hasn&rsquo;t logged in {gap} days
          </span>
          <button
            type="button"
            disabled={nudgedToday}
            onClick={onNudge}
            className="ml-auto h-9 shrink-0 rounded-chip bg-brand px-3 text-xs font-bold
              text-white transition hover:bg-brand-hi disabled:bg-muted disabled:text-ink-off"
          >
            {nudgedToday ? 'Nudged today' : 'Send a nudge'}
          </button>
        </div>
      )}

      {shared.length === 0 ? (
        <p className="text-sm text-ink-mute">
          {isMe ? 'You are not sharing anything here yet.' : 'Not sharing anything yet.'}
        </p>
      ) : (
        <dl className="flex flex-col gap-2.5 text-sm">
          {summary?.calories && (
            <div>
              <dt className="text-xs font-bold text-ink-mute">Calories this week</dt>
              <dd className="text-ink">
                {summary.calories.avgIntake.toLocaleString()} avg against a target of{' '}
                {summary.calories.target.toLocaleString()} &middot;{' '}
                {summary.calories.daysLogged} days logged
              </dd>
            </div>
          )}

          {summary?.weight && (
            <div>
              <dt className="text-xs font-bold text-ink-mute">Weight trend</dt>
              <dd className="text-ink">
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
              <dt className="text-xs font-bold text-ink-mute">Workouts</dt>
              <dd className="text-ink">
                {summary.workouts.sessionsThisWeek} this week
                {summary.workouts.lastDate &&
                  ` · last ${friendlyDayLabel(summary.workouts.lastDate).toLowerCase()}`}
                {summary.workouts.topLifts.length > 0 && (
                  <span className="mt-0.5 block text-xs text-ink-mute">
                    {summary.workouts.topLifts
                      .map((lift) => `${lift.name} ${fromKg(lift.e1rmKg, units).toFixed(0)}${unit}`)
                      .join(' · ')}
                  </span>
                )}
              </dd>
            </div>
          )}

          {summary?.rules && summary.rules.length > 0 && (
            <div>
              <dt className="text-xs font-bold text-ink-mute">Rules</dt>
              <dd className="flex flex-col gap-0.5 text-ink">
                {summary.rules.map((rule) => (
                  <span key={rule.name}>
                    {rule.name} &middot;{' '}
                    <span className="font-bold text-brand">{rule.streak}</span> streak
                    <span className="text-xs text-ink-mute"> ({rule.detail})</span>
                  </span>
                ))}
              </dd>
            </div>
          )}

          {summary?.photos && summary.photos.length > 0 && (
            <div>
              <dt className="text-xs font-bold text-ink-mute">Progress photos</dt>
              <dd className="mt-1 flex gap-2 overflow-x-auto">
                {summary.photos.map((photo) => (
                  <img
                    key={photo.week}
                    src={photo.thumbUrl}
                    alt={`${member.displayName}, ${weekKeyLabel(photo.week)}`}
                    className="h-20 w-[60px] shrink-0 rounded-tile object-cover"
                    loading="lazy"
                  />
                ))}
              </dd>
            </div>
          )}
        </dl>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- sharing */

function Sharing({
  group, flags, publishing, isAdmin, members, uid, onToggle, onLeave, onChanged,
}: {
  group: Group;
  flags: ShareFlags | undefined;
  publishing: boolean;
  isAdmin: boolean;
  members: GroupMember[];
  uid: string;
  onToggle: (key: ShareKey) => void;
  onLeave: () => void;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const { syncNow } = useGroupSync();
  const [name, setName] = useState(group.name);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [handOver, setHandOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const others = members.filter((member) => member.uid !== uid);

  async function save() {
    setBusy(true);
    await renameGroup(group.id, uid, group.inviteCode, name.trim());
    setBusy(false);
    setRenaming(false);
    onChanged();
  }

  async function hand(toUid: string) {
    setBusy(true);
    await transferAdmin(group.id, uid, toUid);
    setBusy(false);
    setHandOver(false);
    onChanged();
  }

  async function destroy() {
    setBusy(true);
    await deleteGroup(group, uid);
    setBusy(false);
    navigate('/groups', { replace: true });
  }

  /**
   * Runs the whole posting job now rather than waiting for tomorrow.
   *
   * Here for testing, which is what it was asked for, but it is also the
   * honest answer to "why has nothing appeared yet": everything it does is
   * idempotent, so pressing it can only ever help.
   */
  async function handleSyncNow() {
    setSyncing(true);
    setSynced(null);
    const outcome = await syncNow();
    setSyncing(false);

    if (!outcome) return;
    if (outcome.failed.length > 0) {
      setSynced(`Some groups refused: ${outcome.failed.join(', ')}.`);
    } else if (outcome.written === 0) {
      setSynced('Up to date — nothing new to post.');
    } else {
      setSynced(
        `Posted ${outcome.written} ${outcome.written === 1 ? 'update' : 'updates'}.`,
      );
    }
  }

  return (
    <>
      <Card tone="muted" className="flex flex-col gap-1">
        <p className="text-xs font-bold text-ink-mute">Invite code</p>
        <p className="font-mono text-2xl tracking-widest text-ink">{group.inviteCode}</p>
        <p className="text-xs text-ink-mute">
          Anyone with this code can join. Share it only with people you want in here.
        </p>
      </Card>

      <Eyebrow>What you share here</Eyebrow>
      <Card>
        <ShareChoices
          flags={flags ?? { stats: false, goals: false, photos: false, activity: true }}
          keys={SHARE_KEYS}
          onToggle={onToggle}
        />
        <p className="mt-3 text-xs text-ink-mute">
          Unticking something removes it from this group straight away, along with any
          posts it made. Anything you do not tick is never written anywhere the group can
          read.
          {publishing && <span className="ml-1 text-brand">Updating…</span>}
        </p>
      </Card>

      <Card className="flex flex-col gap-2.5">
        <Button variant="secondary" onClick={handleSyncNow} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync now'}
        </Button>
        <p className="text-xs text-ink-faint">
          Posts anything owed to your groups right away instead of waiting for the next
          time you open the app. Safe to press twice &mdash; nothing is ever posted
          tw&#105;ce.
          {synced && <span className="mt-1 block font-bold text-brand">{synced}</span>}
        </p>
      </Card>

      {isAdmin && (
        <>
          <Eyebrow>Admin</Eyebrow>
          <Card className="flex flex-col gap-3">
            {renaming ? (
              <>
                <TextInput
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  aria-label="Group name"
                />
                <div className="flex gap-2.5">
                  <Button variant="secondary" onClick={() => setRenaming(false)}>
                    Cancel
                  </Button>
                  <Button onClick={save} disabled={!name.trim() || busy}>
                    {busy ? 'Saving…' : 'Save name'}
                  </Button>
                </div>
              </>
            ) : (
              <Button variant="secondary" onClick={() => setRenaming(true)}>
                Rename group
              </Button>
            )}

            {others.length > 0 && (
              <Button variant="secondary" onClick={() => setHandOver(true)}>
                Hand admin to someone else
              </Button>
            )}

            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="py-2 text-sm font-bold text-ink-mute transition hover:text-danger"
            >
              Delete this group
            </button>
          </Card>
        </>
      )}

      <div className="mt-2">
        {isAdmin && others.length > 0 ? (
          <>
            <Button variant="secondary" onClick={() => setHandOver(true)}>
              Leave this group
            </Button>
            <p className="mt-2 text-center text-xs text-ink-mute">
              You are the admin, so pick who takes over first.
            </p>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onLeave}>
              Leave this group
            </Button>
            <p className="mt-2 text-center text-xs text-ink-mute">
              Leaving deletes your posts and everything you shared here, and ends their
              access immediately.
            </p>
          </>
        )}
      </div>

      {handOver && (
        <ConfirmDialog
          title="Who takes over?"
          confirmLabel="Close"
          onConfirm={() => setHandOver(false)}
          onCancel={() => setHandOver(false)}
        >
          <p className="mb-3">
            They will be able to invite, remove, rename and delete. You stay a member.
          </p>
          <ul className="flex flex-col gap-2">
            {others.map((member) => (
              <li key={member.uid}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => hand(member.uid)}
                  className="flex w-full items-center gap-2.5 rounded-input border
                    border-line-in px-3 py-2.5 text-left text-sm font-bold text-ink
                    transition hover:border-brand disabled:opacity-50"
                >
                  <Avatar name={member.displayName} photo={member.photoURL} size={28} />
                  {member.displayName}
                </button>
              </li>
            ))}
          </ul>
        </ConfirmDialog>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${group.name}?`}
          confirmLabel="Delete"
          busy={busy}
          onConfirm={destroy}
          onCancel={() => setConfirmDelete(false)}
        >
          <p>
            The group, its feed and everything shared in it go for everyone. Nobody loses
            any of their own logs, photos or workouts.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
