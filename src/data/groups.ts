// Groups, membership, and the per-member mirror documents.
//
//   groups/{gid}                                   name, coach, invite code
//   groups/{gid}/members/{uid}                     role and share settings
//   groups/{gid}/members/{uid}/shared/summary      only what that member shares
//   groups/{gid}/notes/{noteId}                    coach notes about a member
//   inviteCodes/{CODE}                             code -> group lookup
//   users/{uid}/groups/{gid}                       so a user can list their groups
//
// The invite-code lookup is its own tiny collection. Finding a group by code
// otherwise means querying the whole groups collection, which would require
// letting any signed-in user list every group that exists.

import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query,
  serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import {
  generateInviteCode, normalizeInviteCode, NO_SHARING,
  type GroupRole, type ShareFlags, type SharedSummary,
} from '../lib/groups';

export interface Group {
  id: string;
  name: string;
  inviteCode: string;
  coachUid: string | null;
  createdBy: string;
  createdAt?: unknown;
}

export interface GroupMember {
  uid: string;
  displayName: string;
  role: GroupRole;
  shareFlags: ShareFlags;
  joinedAt?: unknown;
}

export interface Membership {
  groupId: string;
  name: string;
  role: GroupRole;
  joinedAt?: unknown;
}

export interface CoachNote {
  id: string;
  memberUid: string;
  coachUid: string;
  text: string;
  createdAt?: unknown;
}

const groupsCollection = () => collection(getDb(), 'groups');
const groupRef = (groupId: string) => doc(groupsCollection(), groupId);
const membersCollection = (groupId: string) => collection(groupRef(groupId), 'members');
const memberRef = (groupId: string, uid: string) => doc(membersCollection(groupId), uid);
const sharedRef = (groupId: string, uid: string) =>
  doc(collection(memberRef(groupId, uid), 'shared'), 'summary');
const notesCollection = (groupId: string) => collection(groupRef(groupId), 'notes');
const inviteRef = (code: string) => doc(collection(getDb(), 'inviteCodes'), code);
const membershipsCollection = (uid: string) => collection(getDb(), 'users', uid, 'groups');

export async function listMyGroups(uid: string): Promise<Membership[]> {
  const snap = await getDocs(query(membershipsCollection(uid), orderBy('joinedAt')));
  return snap.docs.map((document) => document.data() as Membership);
}

export async function getGroup(groupId: string): Promise<Group | null> {
  const snap = await getDoc(groupRef(groupId));
  return snap.exists() ? { ...(snap.data() as Group), id: snap.id } : null;
}

export async function listMembers(groupId: string): Promise<GroupMember[]> {
  const snap = await getDocs(query(membersCollection(groupId), orderBy('joinedAt')));
  return snap.docs.map((document) => document.data() as GroupMember);
}

/** Creates a group and makes the creator its first member. */
export async function createGroup(
  uid: string,
  displayName: string,
  name: string,
  asCoach: boolean,
): Promise<Group> {
  const ref = doc(groupsCollection());
  const inviteCode = generateInviteCode();

  const group: Group = {
    id: ref.id,
    name,
    inviteCode,
    coachUid: asCoach ? uid : null,
    createdBy: uid,
  };

  const member: GroupMember = {
    uid,
    displayName,
    role: asCoach ? 'coach' : 'member',
    shareFlags: { ...NO_SHARING },
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
  batch.set(doc(membershipsCollection(uid), ref.id), {
    groupId: ref.id,
    name,
    role: member.role,
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
): Promise<Group> {
  const code = normalizeInviteCode(rawCode);
  const invite = await getDoc(inviteRef(code));
  if (!invite.exists()) throw new JoinError('No group found with that code.');

  const { groupId, name } = invite.data() as { groupId: string; name: string };

  // Membership is written before the group is read, because the group document
  // is readable by members only. Joining is the one flow where that ordering
  // matters.
  const batch = writeBatch(getDb());
  batch.set(memberRef(groupId, uid), {
    uid,
    displayName,
    role: 'member',
    shareFlags: { ...NO_SHARING },
    joinedAt: serverTimestamp(),
  });
  batch.set(doc(membershipsCollection(uid), groupId), {
    groupId,
    name,
    role: 'member',
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
 * check for it on every read, so access ends immediately.
 */
export async function leaveGroup(uid: string, groupId: string): Promise<void> {
  const batch = writeBatch(getDb());
  batch.delete(sharedRef(groupId, uid));
  batch.delete(memberRef(groupId, uid));
  batch.delete(doc(membershipsCollection(uid), groupId));
  await batch.commit();
}

export async function updateShareFlags(
  uid: string,
  groupId: string,
  shareFlags: ShareFlags,
): Promise<void> {
  await updateDoc(memberRef(groupId, uid), { shareFlags });
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

export async function addNote(
  groupId: string,
  coachUid: string,
  memberUid: string,
  text: string,
): Promise<void> {
  await addDoc(notesCollection(groupId), {
    coachUid,
    memberUid,
    text,
    createdAt: serverTimestamp(),
  });
}

export async function listNotes(groupId: string, max = 50): Promise<CoachNote[]> {
  const snap = await getDocs(
    query(notesCollection(groupId), orderBy('createdAt', 'desc'), limit(max)),
  );
  return snap.docs.map((document) => ({ ...(document.data() as CoachNote), id: document.id }));
}

export async function deleteNote(groupId: string, noteId: string): Promise<void> {
  await deleteDoc(doc(notesCollection(groupId), noteId));
}
