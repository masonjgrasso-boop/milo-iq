// Groups, membership, and the per-member mirror documents.
//
//   groups/{gid}                                   name, admin, invite code
//   groups/{gid}/members/{uid}                     role and share settings
//   groups/{gid}/members/{uid}/shared/summary      only what that member shares
//   groups/{gid}/posts/{postId}                    the feed (see ./posts)
//   inviteCodes/{CODE}                             code -> group lookup
//   users/{uid}/groups/{gid}                       so a user can list their groups
//
// The invite-code lookup is its own tiny collection. Finding a group by code
// otherwise means querying the whole groups collection, which would require
// letting any signed-in user list every group that exists.
//
// A group has one admin and everyone else is a member. Nobody, admin
// included, can write into another user's own data, which is why a few
// housekeeping jobs heal themselves instead: renaming a group, removing a
// member and deleting a group all leave the other person's pointer at
// users/{uid}/groups/{gid} momentarily stale, and their own client tidies it
// the next time they look. The alternative would be a rule letting one user
// write inside another's documents, which is not a trade worth making for a
// stale group name.

import {
  collection, deleteDoc, doc, getDoc, getDocs, orderBy, query,
  serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import {
  generateInviteCode, migrateShareFlags, normalizeInviteCode, DEFAULT_SHARING,
  type GroupRole, type ShareFlags, type SharedSummary,
} from '../lib/groups';

export interface Group {
  id: string;
  name: string;
  inviteCode: string;
  /** The one person who can invite, remove, rename and delete. */
  adminUid: string;
  createdBy: string;
  /**
   * When anything was last posted here.
   *
   * Denormalised onto the group so the dot on the Groups tab costs one small
   * read per group rather than a query of every feed. Any member may move it
   * forward, and the rules allow them to touch nothing else on this
   * document.
   */
  lastPostAt?: unknown;
  createdAt?: unknown;
}

export interface GroupMember {
  uid: string;
  displayName: string;
  photoURL?: string;
  role: GroupRole;
  shareFlags: ShareFlags;
  joinedAt?: unknown;
}

export interface Membership {
  groupId: string;
  name: string;
  role: GroupRole;
  /**
   * A copy of the member's own flags.
   *
   * Denormalised so that the code which writes automatic posts can tell, from
   * the one list it already reads, which groups should hear about a finished
   * workout. Without it every post would cost a read of every group's member
   * document first.
   */
  shareFlags?: ShareFlags;
  /** When this member last opened the group, for the new-posts dot. */
  lastSeenAt?: unknown;
  /**
   * The highest achievement already announced to this group.
   *
   * Kept here, on the member's own pointer, so a milestone or a streak is
   * announced once rather than once a day for as long as it stands. It has to
   * be per group: somebody who joins in March should not arrive to a backlog
   * of January's milestones.
   */
  lastMilestone?: number;
  lastStreak?: number;
  lastCalorieWeek?: string;
  /** The ISO week the weekly report last went out for. */
  lastStatsWeek?: string;
  joinedAt?: unknown;
}

const groupsCollection = () => collection(getDb(), 'groups');
export const groupRef = (groupId: string) => doc(groupsCollection(), groupId);
const membersCollection = (groupId: string) => collection(groupRef(groupId), 'members');
const memberRef = (groupId: string, uid: string) => doc(membersCollection(groupId), uid);
const sharedRef = (groupId: string, uid: string) =>
  doc(collection(memberRef(groupId, uid), 'shared'), 'summary');
const inviteRef = (code: string) => doc(collection(getDb(), 'inviteCodes'), code);
const membershipsCollection = (uid: string) => collection(getDb(), 'users', uid, 'groups');
const membershipRef = (uid: string, groupId: string) =>
  doc(membershipsCollection(uid), groupId);

export async function listMyGroups(uid: string): Promise<Membership[]> {
  const snap = await getDocs(query(membershipsCollection(uid), orderBy('joinedAt')));
  return snap.docs.map((document) => {
    const membership = document.data() as Membership;
    // Older records carry a flag per section of the mirror; fold them into
    // the three without resetting what the member chose.
    return { ...membership, shareFlags: migrateShareFlags(membership.shareFlags) };
  });
}

export async function getGroup(groupId: string): Promise<Group | null> {
  const snap = await getDoc(groupRef(groupId));
  return snap.exists() ? { ...(snap.data() as Group), id: snap.id } : null;
}

export async function listMembers(groupId: string): Promise<GroupMember[]> {
  const snap = await getDocs(query(membersCollection(groupId), orderBy('joinedAt')));
  return snap.docs.map((document) => {
    const member = document.data() as GroupMember;
    return { ...member, shareFlags: migrateShareFlags(member.shareFlags) };
  });
}

/**
 * Creates a group. Whoever makes it is its admin.
 *
 * The sharing choices come in with the call, because they are asked for
 * before the group exists rather than discovered in a settings tab after.
 */
export async function createGroup(
  uid: string,
  displayName: string,
  name: string,
  shareFlags: ShareFlags,
  photoURL?: string,
): Promise<Group> {
  const ref = doc(groupsCollection());
  const inviteCode = generateInviteCode();

  const group: Group = { id: ref.id, name, inviteCode, adminUid: uid, createdBy: uid };
  const member: GroupMember = {
    uid,
    displayName,
    ...(photoURL ? { photoURL } : {}),
    role: 'admin',
    shareFlags: { ...DEFAULT_SHARING, ...shareFlags },
  };

  const batch = writeBatch(getDb());
  batch.set(ref, { ...group, createdAt: serverTimestamp() });
  batch.set(memberRef(ref.id, uid), { ...member, joinedAt: serverTimestamp() });
  // The name lives on the invite too, so joining never has to read the group
  // document first — which is what lets that document stay members-only.
  batch.set(inviteRef(inviteCode), {
    groupId: ref.id,
    name,
    createdBy: uid,
    createdAt: serverTimestamp(),
  });
  batch.set(membershipRef(uid, ref.id), {
    groupId: ref.id,
    name,
    role: member.role,
    shareFlags: member.shareFlags,
    joinedAt: serverTimestamp(),
  });
  await batch.commit();

  return group;
}

export class JoinError extends Error {}

/** Joins by invite code. Nothing is shared until the member chooses to. */
export async function joinGroup(
  uid: string,
  displayName: string,
  rawCode: string,
  shareFlags: ShareFlags,
  photoURL?: string,
): Promise<Group> {
  const code = normalizeInviteCode(rawCode);
  const invite = await getDoc(inviteRef(code));
  if (!invite.exists()) throw new JoinError('No group found with that code.');

  const { groupId, name } = invite.data() as { groupId: string; name: string };

  // Membership is written before the group is read, because the group document
  // is readable by members only. Joining is the one flow where that ordering
  // matters.
  const batch = writeBatch(getDb());
  const flags = { ...DEFAULT_SHARING, ...shareFlags };
  batch.set(memberRef(groupId, uid), {
    uid,
    displayName,
    ...(photoURL ? { photoURL } : {}),
    role: 'member',
    shareFlags: flags,
    joinedAt: serverTimestamp(),
  });
  batch.set(membershipRef(uid, groupId), {
    groupId,
    name,
    role: 'member',
    shareFlags: flags,
    joinedAt: serverTimestamp(),
  });
  await batch.commit();

  const group = await getGroup(groupId);
  if (!group) throw new JoinError('That group no longer exists.');
  return group;
}

/**
 * Leaves a group, removing the member document, the mirror and the pointer.
 *
 * Deleting the member document is what removes access: the security rules
 * check for it on every read, so access ends immediately. The caller clears
 * the member's posts first, while they still have permission to.
 */
export async function leaveGroup(uid: string, groupId: string): Promise<void> {
  const batch = writeBatch(getDb());
  batch.delete(sharedRef(groupId, uid));
  batch.delete(memberRef(groupId, uid));
  batch.delete(membershipRef(uid, groupId));
  await batch.commit();
}

/**
 * Removes somebody else. Admin only, and enforced in the rules rather than
 * here.
 *
 * Their pointer under their own user document cannot be touched from here, so
 * it is left for their client to tidy when it next finds the group gone.
 */
export async function removeMember(groupId: string, uid: string): Promise<void> {
  const batch = writeBatch(getDb());
  batch.delete(sharedRef(groupId, uid));
  batch.delete(memberRef(groupId, uid));
  await batch.commit();
}

/**
 * Hands the group to someone else.
 *
 * The admin writes both role changes and the group document in one batch, so
 * there is never a moment with two admins or none.
 */
export async function transferAdmin(
  groupId: string,
  fromUid: string,
  toUid: string,
): Promise<void> {
  const batch = writeBatch(getDb());
  batch.update(groupRef(groupId), { adminUid: toUid });
  batch.update(memberRef(groupId, toUid), { role: 'admin' });
  batch.update(memberRef(groupId, fromUid), { role: 'member' });
  await batch.commit();
}

/** Renames the group, and the invite that carries the name for joiners. */
export async function renameGroup(
  groupId: string,
  adminUid: string,
  inviteCode: string,
  name: string,
): Promise<void> {
  const batch = writeBatch(getDb());
  batch.update(groupRef(groupId), { name });
  batch.update(inviteRef(inviteCode), { name });
  batch.update(membershipRef(adminUid, groupId), { name });
  await batch.commit();
}

/**
 * Deletes the group itself.
 *
 * The admin can reach the group document, the invite, every member record and
 * every post, so all of those go. What is left behind is each other member's
 * own pointer, which only they can delete; their client does that the next
 * time it finds the group missing.
 */
export async function deleteGroup(group: Group, adminUid: string): Promise<void> {
  const members = await listMembers(group.id);

  const batch = writeBatch(getDb());
  for (const member of members) {
    batch.delete(sharedRef(group.id, member.uid));
    batch.delete(memberRef(group.id, member.uid));
  }
  batch.delete(inviteRef(group.inviteCode));
  batch.delete(groupRef(group.id));
  batch.delete(membershipRef(adminUid, group.id));
  await batch.commit();
}

/** Drops a pointer to a group that has gone, or that we were removed from. */
export async function forgetGroup(uid: string, groupId: string): Promise<void> {
  await deleteDoc(membershipRef(uid, groupId));
}

/** Keeps a member's own pointer in step with a name the admin changed. */
export async function syncMembershipName(
  uid: string,
  groupId: string,
  name: string,
): Promise<void> {
  await updateDoc(membershipRef(uid, groupId), { name });
}

export async function updateShareFlags(
  uid: string,
  groupId: string,
  shareFlags: ShareFlags,
): Promise<void> {
  const batch = writeBatch(getDb());
  batch.update(memberRef(groupId, uid), { shareFlags });
  // The copy on the pointer is what the automatic posts read.
  batch.update(membershipRef(uid, groupId), { shareFlags });
  await batch.commit();
}

/** Writes the mirror document: only the sections the member shares. */
export async function publishShare(
  uid: string,
  groupId: string,
  summary: SharedSummary,
): Promise<void> {
  // A plain set, never a merge: a merge would leave behind sections from a
  // previous publish that the member has since stopped sharing.
  await setDoc(sharedRef(groupId, uid), { ...summary, updatedAt: serverTimestamp() });
}

export async function getSharedSummary(
  groupId: string,
  uid: string,
): Promise<SharedSummary | null> {
  const snap = await getDoc(sharedRef(groupId, uid));
  return snap.exists() ? (snap.data() as SharedSummary) : null;
}

/**
 * Moves the group's "something happened" marker forward.
 *
 * The only field a plain member may change on the group document, which the
 * rules enforce. Swallows its own failure: a dot on a tab is not worth
 * failing a post over.
 */
export async function touchGroupActivity(groupId: string): Promise<void> {
  await updateDoc(groupRef(groupId), { lastPostAt: serverTimestamp() }).catch(() => undefined);
}

/** Notes that this member has now seen the group, clearing their dot. */
export async function markGroupSeen(uid: string, groupId: string): Promise<void> {
  await updateDoc(membershipRef(uid, groupId), { lastSeenAt: serverTimestamp() })
    .catch(() => undefined);
}

/**
 * Records the highest achievement announced to a group.
 *
 * Written to the member's own pointer, so it is theirs to keep and nobody
 * else can reset it to make the app repeat itself.
 */
export async function recordAnnounced(
  uid: string,
  groupId: string,
  announced: Record<string, unknown>,
): Promise<void> {
  await updateDoc(membershipRef(uid, groupId), announced).catch(() => undefined);
}
