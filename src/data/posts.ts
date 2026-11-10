// The group feed, its comments, reactions and nudges.
//
//   groups/{gid}/posts/{postId}                    a post
//   groups/{gid}/posts/{postId}/comments/{cid}     its comments
//   groups/{gid}/nudges/{toUid}_{day}              one nudge, for one person
//
// Reactions live in a map on the post rather than in a subcollection, so a
// page of twenty posts arrives with its reactions already on it instead of
// costing twenty more queries. The rules make that safe by refusing any write
// that touches somebody else's key in the map.
//
// Comments are the other way round, a subcollection, because the rules have
// to be able to say "delete your own, or any if you are the admin" about one
// comment at a time. Proving that about an element of an array in a diff is
// the kind of rule nobody can read, and this feature is one the user asked to
// be strict about. The cost is that a post shows its comments only once
// opened, which is also the only time they are worth reading.

import {
  collection, collectionGroup, deleteDoc, doc, getDocs, limit, orderBy, query,
  serverTimestamp, setDoc, startAfter, updateDoc, where, writeBatch,
  type DocumentData, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, listAll, ref, uploadBytes, getMetadata } from 'firebase/storage';
import { getDb, getFirebaseStorage } from '../lib/firebase';
import {
  expiryFrom, feedCutoff, withoutItems, PAGE_SIZE,
  type FeedComment, type FeedPost, type ItemKind, type Nudge, type PostItem,
  type PostKind, type Reaction,
} from '../lib/feed';
import type { DayKey } from '../lib/dates';
import { groupRef } from './groups';

const postsCollection = (groupId: string) => collection(groupRef(groupId), 'posts');
const postRef = (groupId: string, postId: string) => doc(postsCollection(groupId), postId);
const commentsCollection = (groupId: string, postId: string) =>
  collection(postRef(groupId, postId), 'comments');
const nudgesCollection = (groupId: string) => collection(groupRef(groupId), 'nudges');

/** Where the next page starts. Opaque to callers. */
export type FeedCursor = QueryDocumentSnapshot<DocumentData> | null;

export interface FeedPage {
  posts: FeedPost[];
  cursor: FeedCursor;
  /** False once a short page comes back, so the list stops asking. */
  more: boolean;
}

/**
 * One page of the feed, newest first, reaching back thirty days.
 *
 * The date filter is belt and braces against the TTL policy, which deletes
 * expired posts within a day or so of their expiry rather than on the
 * stroke of midnight. Without it a feed could briefly show a post that is
 * meant to be gone.
 *
 * `author` narrows it to a single member, which is the filter the feed
 * offers. Both shapes order on createdAt and both need a composite index;
 * they are declared in firestore.indexes.json.
 */
export async function listPosts(
  groupId: string,
  options: { author?: string; after?: FeedCursor; pageSize?: number } = {},
): Promise<FeedPage> {
  const size = options.pageSize ?? PAGE_SIZE;
  const clauses = [
    ...(options.author ? [where('authorUid', '==', options.author)] : []),
    where('createdAt', '>=', feedCutoff()),
    orderBy('createdAt', 'desc'),
    ...(options.after ? [startAfter(options.after)] : []),
    limit(size),
  ];

  const snap = await getDocs(query(postsCollection(groupId), ...clauses));
  const posts = snap.docs.map((document) => ({
    ...(document.data() as FeedPost),
    id: document.id,
  }));

  return {
    posts,
    cursor: snap.docs[snap.docs.length - 1] ?? null,
    more: snap.docs.length === size,
  };
}

export interface NewPost {
  authorUid: string;
  authorName: string;
  authorPhoto?: string;
  kind: PostKind;
  body?: string;
  headline?: string;
  detail?: string;
  imageUrl?: string;
  thumbUrl?: string;
  spark?: number[];
}

/** Posts something the member wrote. A fresh id, so it is never deduplicated. */
export async function createPost(groupId: string, post: NewPost): Promise<FeedPost> {
  const ref = doc(postsCollection(groupId));
  await setDoc(ref, { ...post, createdAt: serverTimestamp(), expiresAt: expiryFrom() });
  return { ...post, id: ref.id };
}

/**
 * Adds or replaces one line on a member's digest for the day.
 *
 * Merged, which is what makes the digest work. The id is the member and the
 * day, so the first line of the day creates the card and every later line
 * joins it; each line is one key in the `items` map, so writing the same
 * line twice replaces it rather than adding a duplicate. The payload never
 * contains a `reactions` key, so merging also leaves alone whatever people
 * have already left on the card.
 */
export async function writeDigestItem(
  groupId: string,
  postId: string,
  post: Omit<NewPost, 'kind'>,
  item: PostItem,
): Promise<void> {
  await setDoc(
    postRef(groupId, postId),
    {
      ...post,
      kind: 'digest',
      items: { [item.kind]: item },
      createdAt: serverTimestamp(),
      // Reset with every line, so a card that gained something today lasts
      // thirty days from today rather than from whenever it started.
      expiresAt: expiryFrom(),
    },
    { merge: true },
  );
}

export async function deletePost(groupId: string, postId: string): Promise<void> {
  // Comments are a subcollection, which Firestore does not cascade. The feed
  // never reaches an orphaned comment, because it only ever reads comments
  // through a post that exists, and the rules only ever grant them through
  // one too.
  const comments = await getDocs(commentsCollection(groupId, postId));
  const batch = writeBatch(getDb());
  for (const comment of comments.docs) batch.delete(comment.ref);
  batch.delete(postRef(groupId, postId));
  await batch.commit();
}

/** Firestore's cap on the writes in one batch. */
const BATCH_LIMIT = 400;

/**
 * Clears everything a member posted in a group.
 *
 * Called when somebody leaves or is removed. Returns how many went, so a
 * caller can say so.
 */
export async function deleteAuthorPosts(
  groupId: string,
  authorUid: string,
  kinds?: PostKind[],
): Promise<number> {
  const snap = await getDocs(
    query(postsCollection(groupId), where('authorUid', '==', authorUid)),
  );

  const doomed = snap.docs.filter((document) => {
    if (!kinds) return true;
    return kinds.includes((document.data() as FeedPost).kind);
  });

  let written = 0;
  for (let i = 0; i < doomed.length; i += BATCH_LIMIT) {
    const batch = writeBatch(getDb());
    for (const document of doomed.slice(i, i + BATCH_LIMIT)) batch.delete(document.ref);
    await batch.commit();
    written += Math.min(BATCH_LIMIT, doomed.length - i);
  }
  return written;
}

/**
 * Takes certain kinds of line out of a member's digests.
 *
 * This is what unticking a category does to history. Because one card can
 * carry lines from more than one category, it is not a matter of deleting
 * posts: a card that was only ever a workout goes entirely, and one that
 * also held a weight line keeps that line and loses the rest.
 */
export async function pruneAuthorItems(
  groupId: string,
  authorUid: string,
  removing: ItemKind[],
): Promise<void> {
  if (removing.length === 0) return;

  const snap = await getDocs(
    query(postsCollection(groupId), where('authorUid', '==', authorUid)),
  );
  const digests = snap.docs.filter(
    (document) => (document.data() as FeedPost).kind === 'digest',
  );

  for (let i = 0; i < digests.length; i += BATCH_LIMIT) {
    const batch = writeBatch(getDb());
    for (const document of digests.slice(i, i + BATCH_LIMIT)) {
      const kept = withoutItems((document.data() as FeedPost).items, removing);
      // An update replaces the whole map, which is what leaves only `kept`.
      if (kept === null) batch.delete(document.ref);
      else batch.update(document.ref, { items: kept });
    }
    await batch.commit();
  }
}

/* --------------------------------------------------------------- comments */

export async function listComments(
  groupId: string,
  postId: string,
): Promise<FeedComment[]> {
  const snap = await getDocs(
    query(commentsCollection(groupId, postId), orderBy('createdAt')),
  );
  return snap.docs.map((document) => ({
    ...(document.data() as FeedComment),
    id: document.id,
  }));
}

export async function addComment(
  groupId: string,
  postId: string,
  comment: { authorUid: string; authorName: string; text: string },
): Promise<FeedComment> {
  const ref = doc(commentsCollection(groupId, postId));
  // A comment carries its own expiry because deleting a post does not cascade
  // to its subcollection, in Firestore or in a TTL policy. Both need a policy
  // of their own, and both have one.
  await setDoc(ref, { ...comment, createdAt: serverTimestamp(), expiresAt: expiryFrom() });
  return { ...comment, id: ref.id };
}

export async function deleteComment(
  groupId: string,
  postId: string,
  commentId: string,
): Promise<void> {
  await deleteDoc(doc(commentsCollection(groupId, postId), commentId));
}

/* -------------------------------------------------------------- reactions */

/**
 * Writes the whole reactions map back.
 *
 * Safe despite looking careless: the rules reject any write to this field
 * that changes a key other than the writer's own, so the worst a tampered
 * client can do is change its own reaction.
 */
export async function setReactions(
  groupId: string,
  postId: string,
  reactions: Record<string, Reaction>,
): Promise<void> {
  await updateDoc(postRef(groupId, postId), { reactions });
}

/* ----------------------------------------------------------------- nudges */

/**
 * Sends a nudge, or fails if that person already has one today.
 *
 * The id is the recipient and the day, and the rules allow create but never
 * update, so the once-a-day limit is the database's to enforce rather than
 * something a modified client could skip.
 */
export async function sendNudge(
  groupId: string,
  nudge: Omit<Nudge, 'id' | 'seen' | 'createdAt'>,
  nudgeDocId: string,
): Promise<void> {
  await setDoc(doc(nudgesCollection(groupId), nudgeDocId), {
    ...nudge,
    seen: false,
    createdAt: serverTimestamp(),
    expiresAt: expiryFrom(),
  });
}

/**
 * The unseen nudges waiting for this user, across every group they are in.
 *
 * One collection-group query rather than one query per group, so opening the
 * app costs the same whether somebody is in one group or six. The rule on
 * this path grants a document only when its `toUid` is the reader, so the
 * query can only ever return nudges addressed to them — the filter below is
 * what makes it satisfiable at all, not merely what narrows it.
 */
export async function listMyNudges(uid: string, max = 5): Promise<Nudge[]> {
  const snap = await getDocs(
    query(
      collectionGroup(getDb(), 'nudges'),
      where('toUid', '==', uid),
      where('seen', '==', false),
      orderBy('createdAt', 'desc'),
      limit(max),
    ),
  );
  return snap.docs.map((document) => ({
    ...(document.data() as Nudge),
    id: document.id,
  }));
}

/** Marks a nudge read, which only its recipient may do. */
export async function markNudgeSeen(
  groupId: string,
  nudgeDocId: string,
): Promise<void> {
  await updateDoc(doc(nudgesCollection(groupId), nudgeDocId), { seen: true });
}

/** Whether this member already has a nudge waiting today. */
export async function nudgesSentToday(
  groupId: string,
  day: DayKey,
): Promise<Set<string>> {
  const snap = await getDocs(query(nudgesCollection(groupId), where('day', '==', day)));
  return new Set(snap.docs.map((document) => (document.data() as Nudge).toUid));
}

/* ---------------------------------------------------------- post pictures */

/**
 * Where a post's picture lives: under its author, like a progress photo.
 *
 * Storage rules cannot read Firestore, so an object cannot be gated on group
 * membership without a backend this app does not have. Sharing therefore
 * works the way progress photos already do — the post carries the tokenised
 * download URL, which exists only in a group the author chose to post in and
 * goes when the post does.
 */
const postImagePaths = (uid: string, postId: string) => ({
  full: `users/${uid}/posts/${postId}.jpg`,
  thumb: `users/${uid}/posts/${postId}_thumb.jpg`,
});

export interface UploadedImage {
  imageUrl: string;
  thumbUrl: string;
}

export async function uploadPostImage(
  uid: string,
  postId: string,
  image: { full: Blob; thumb: Blob },
): Promise<UploadedImage> {
  const paths = postImagePaths(uid, postId);
  const storage = getFirebaseStorage();
  const metadata = { contentType: 'image/jpeg', cacheControl: 'private, max-age=31536000' };

  const [fullSnap, thumbSnap] = await Promise.all([
    uploadBytes(ref(storage, paths.full), image.full, metadata),
    uploadBytes(ref(storage, paths.thumb), image.thumb, metadata),
  ]);

  const [imageUrl, thumbUrl] = await Promise.all([
    getDownloadURL(fullSnap.ref),
    getDownloadURL(thumbSnap.ref),
  ]);
  return { imageUrl, thumbUrl };
}

/** Removes a post's picture. A file already gone is not worth failing over. */
export async function deletePostImage(uid: string, postId: string): Promise<void> {
  const paths = postImagePaths(uid, postId);
  const storage = getFirebaseStorage();
  await Promise.all(
    [paths.full, paths.thumb].map((path) =>
      deleteObject(ref(storage, path)).catch(() => undefined),
    ),
  );
}

/**
 * Deletes a member's post images once the posts carrying them have expired.
 *
 * A Firestore TTL policy removes documents; it knows nothing about Cloud
 * Storage, and there is no backend here to tell. So the author sweeps their
 * own folder: everything in it belongs to a post that is gone or going, and
 * the only thing older than the feed window is litter.
 *
 * Progress photos live under users/{uid}/photos and are never touched. They
 * are a member's own timeline, not feed content, and they are kept forever.
 */
export async function sweepExpiredPostImages(uid: string): Promise<number> {
  const storage = getFirebaseStorage();
  const folder = ref(storage, `users/${uid}/posts`);
  const cutoff = feedCutoff().getTime();

  let removed = 0;
  try {
    const listing = await listAll(folder);
    await Promise.all(
      listing.items.map(async (item) => {
        try {
          const meta = await getMetadata(item);
          if (new Date(meta.timeCreated).getTime() >= cutoff) return;
          await deleteObject(item);
          removed += 1;
        } catch {
          // One stubborn file is not worth abandoning the sweep.
        }
      }),
    );
  } catch {
    // No folder yet, or storage unreachable. Nothing to clean either way.
  }
  return removed;
}
