// Firestore security rule tests.
//
// These run against the Firebase emulator, so they exercise the real rules
// engine rather than our understanding of it. Both halves matter: that the
// right people can read, and — more importantly — that nobody else can.

import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, query, setDoc,
  updateDoc, where,
} from 'firebase/firestore';

const ALICE = 'alice';
const BOB = 'bob';
const CAROL = 'carol';
const GROUP = 'group1';

let testEnv: RulesTestEnvironment;

const asAlice = () => testEnv.authenticatedContext(ALICE).firestore();
const asBob = () => testEnv.authenticatedContext(BOB).firestore();
const asCarol = () => testEnv.authenticatedContext(CAROL).firestore();
const asAnon = () => testEnv.unauthenticatedContext().firestore();

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'milo-iq-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  // Alice and Bob are in a group Alice coaches. Carol is an outsider.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'groups', GROUP), {
      name: 'Test group', inviteCode: 'AB3K9P', adminUid: ALICE, createdBy: ALICE,
    });
    await setDoc(doc(db, 'groups', GROUP, 'members', ALICE), {
      uid: ALICE, displayName: 'Alice', role: 'admin', shareFlags: {},
    });
    await setDoc(doc(db, 'groups', GROUP, 'members', BOB), {
      uid: BOB, displayName: 'Bob', role: 'member', shareFlags: {},
    });
    await setDoc(doc(db, 'groups', GROUP, 'members', BOB, 'shared', 'summary'), {
      uid: BOB, displayName: 'Bob', calories: { avgIntake: 1900 },
    });
    await setDoc(doc(db, 'inviteCodes', 'AB3K9P'), {
      groupId: GROUP, name: 'Test group', createdBy: ALICE,
    });
    // A feed with one post of Bob's on it, and a comment of his beneath it.
    await setDoc(doc(db, 'groups', GROUP, 'posts', 'p1'), {
      authorUid: BOB, authorName: 'Bob', kind: 'note', body: 'Morning all',
      createdAt: new Date(), reactions: { [CAROL]: 'fire' },
    });
    await setDoc(doc(db, 'groups', GROUP, 'posts', 'p1', 'comments', 'c1'), {
      authorUid: BOB, authorName: 'Bob', text: 'and again', createdAt: new Date(),
    });

    await setDoc(doc(db, 'users', BOB), { units: 'metric' });
    await setDoc(doc(db, 'users', BOB, 'days', '2026-03-04'), { date: '2026-03-04', calories: 2000 });
  });
});

describe('a user and their own data', () => {
  it('can read and write their own profile', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), 'users', ALICE), { units: 'metric' }));
    await assertSucceeds(getDoc(doc(asAlice(), 'users', ALICE)));
  });

  it('can read and write their own subcollections', async () => {
    await assertSucceeds(
      setDoc(doc(asAlice(), 'users', ALICE, 'days', '2026-03-04'), { calories: 1800 }),
    );
    await assertSucceeds(
      getDoc(doc(asAlice(), 'users', ALICE, 'workouts', 'w1')),
    );
  });

  it('cannot read another user profile', async () => {
    await assertFails(getDoc(doc(asAlice(), 'users', BOB)));
  });

  it('cannot read another user day logs, even as their coach', async () => {
    // Alice coaches Bob, but coaching grants no access to raw data — only to
    // what Bob publishes into the group mirror.
    await assertFails(getDoc(doc(asAlice(), 'users', BOB, 'days', '2026-03-04')));
  });

  it('cannot write to another user data', async () => {
    await assertFails(setDoc(doc(asAlice(), 'users', BOB), { units: 'imperial' }));
    await assertFails(
      setDoc(doc(asAlice(), 'users', BOB, 'days', '2026-03-04'), { calories: 1 }),
    );
  });

  it('denies anonymous access entirely', async () => {
    await assertFails(getDoc(doc(asAnon(), 'users', ALICE)));
    await assertFails(setDoc(doc(asAnon(), 'users', ALICE), { units: 'metric' }));
  });

  // The year view lists these rather than reading 365 day logs.
  it('can list its own weekly summaries', async () => {
    await assertSucceeds(getDocs(query(collection(asBob(), 'users', BOB, 'weeks'))));
  });

  it('cannot list another user’s weekly summaries', async () => {
    await assertFails(getDocs(query(collection(asAlice(), 'users', BOB, 'weeks'))));
    await assertFails(getDocs(query(collection(asAnon(), 'users', BOB, 'weeks'))));
  });

  // Routine days: the plan, which is as private as the logs.
  it('can list its own routine days', async () => {
    await assertSucceeds(getDocs(query(collection(asBob(), 'users', BOB, 'routines'))));
  });

  it('cannot read or write another user’s routine days', async () => {
    await assertFails(getDocs(query(collection(asAlice(), 'users', BOB, 'routines'))));
    await assertFails(
      setDoc(doc(asAlice(), 'users', BOB, 'routines', 'day1'), { name: 'Legs' }),
    );
  });

  // Workout sessions, which hang beneath their exercise.
  it('can read and write its own workout sessions', async () => {
    await assertSucceeds(
      setDoc(doc(asBob(), 'users', BOB, 'exercises', 'sq', 'sessions', '2026-11-02'), {
        date: '2026-11-02',
        sets: [{ weightKg: 100, reps: 8 }],
        bestE1rmKg: 126.7,
      }),
    );
    await assertSucceeds(
      getDocs(query(collection(asBob(), 'users', BOB, 'exercises', 'sq', 'sessions'))),
    );
  });

  it('cannot touch another user’s workout sessions', async () => {
    await assertFails(
      getDocs(query(collection(asAlice(), 'users', BOB, 'exercises', 'sq', 'sessions'))),
    );
    await assertFails(
      setDoc(doc(asAlice(), 'users', BOB, 'exercises', 'sq', 'sessions', '2026-11-02'), {
        sets: [],
      }),
    );
  });

  // Personal rules. The checklist tab keeps a live listener on this
  // collection, which is a list operation, so that is asserted on purpose.
  it('can read, list and write its own rules', async () => {
    await assertSucceeds(
      setDoc(doc(asBob(), 'users', BOB, 'rules', 'r1'), {
        name: '10k steps', type: 'numeric', target: 10000, daysOfWeek: [], active: true,
      }),
    );
    await assertSucceeds(getDoc(doc(asBob(), 'users', BOB, 'rules', 'r1')));
    await assertSucceeds(getDocs(query(collection(asBob(), 'users', BOB, 'rules'))));
  });

  it('cannot touch another user’s rules', async () => {
    await assertFails(getDocs(query(collection(asAlice(), 'users', BOB, 'rules'))));
    await assertFails(getDoc(doc(asAlice(), 'users', BOB, 'rules', 'r1')));
    await assertFails(
      setDoc(doc(asAlice(), 'users', BOB, 'rules', 'r1'), { name: 'Hijacked' }),
    );
    await assertFails(getDocs(query(collection(asAnon(), 'users', BOB, 'rules'))));
  });

  // The dot on the Rules tab watches today's day document.
  it('can listen to its own day document', async () => {
    await assertSucceeds(getDoc(doc(asBob(), 'users', BOB, 'days', '2026-03-04')));
  });

  // Goal history is a field on the profile document rather than a collection
  // of its own, so it rides on the profile rule above. Asserted on purpose
  // because it is the record that keeps each past day attached to the goal it
  // was logged under: losing it would re-score months of logs.
  const HISTORY = [
    { startDate: '2026-01-01', goal: 'lose', targetRateKgPerWeek: 0.45, calorieTarget: 2000 },
    { startDate: '2026-06-01', goal: 'gain', targetRateKgPerWeek: 0.2, calorieTarget: 2800 },
  ];

  it('can write and read back its own goal history', async () => {
    await assertSucceeds(
      setDoc(
        doc(asBob(), 'users', BOB),
        { units: 'metric', goalHistory: HISTORY },
        { merge: true },
      ),
    );
    await assertSucceeds(getDoc(doc(asBob(), 'users', BOB)));
  });

  it('cannot rewrite another user’s goal history', async () => {
    await assertFails(
      setDoc(
        doc(asAlice(), 'users', BOB),
        { goalHistory: [{ startDate: '2026-01-01', goal: 'gain', calorieTarget: 9000 }] },
        { merge: true },
      ),
    );
    await assertFails(
      setDoc(doc(asAnon(), 'users', BOB), { goalHistory: [] }, { merge: true }),
    );
  });

  it('does not expose goal history through the group mirror', async () => {
    // Alice administers Bob's group and can read the summary he chose to
    // publish. That mirror is a separate document, so his profile — and with
    // it his goals, rate and body figures — stays shut to her.
    await assertSucceeds(
      getDoc(doc(asAlice(), 'groups', GROUP, 'members', BOB, 'shared', 'summary')),
    );
    await assertFails(getDoc(doc(asAlice(), 'users', BOB)));
  });
});

describe('group documents', () => {
  it('lets a member read the group', async () => {
    await assertSucceeds(getDoc(doc(asBob(), 'groups', GROUP)));
  });

  it('stops a non-member reading the group', async () => {
    await assertFails(getDoc(doc(asCarol(), 'groups', GROUP)));
  });

  it('stops anyone listing all groups', async () => {
    await assertFails(getDocs(query(collection(asBob(), 'groups'))));
  });

  it('lets a user create a group they own and administer', async () => {
    await assertSucceeds(
      setDoc(doc(asCarol(), 'groups', 'new1'), {
        name: 'Carol group', inviteCode: 'XY7M2Q', adminUid: CAROL, createdBy: CAROL,
      }),
    );
  });

  it('stops a user creating a group attributed to someone else', async () => {
    await assertFails(
      setDoc(doc(asCarol(), 'groups', 'new2'), {
        name: 'Fake', inviteCode: 'XY7M2R', adminUid: CAROL, createdBy: ALICE,
      }),
    );
  });

  it('stops a group arriving with somebody else already its admin', async () => {
    // Otherwise a group could be created pre-captured by another account.
    await assertFails(
      setDoc(doc(asCarol(), 'groups', 'new3'), {
        name: 'Captured', inviteCode: 'XY7M2S', adminUid: ALICE, createdBy: CAROL,
      }),
    );
  });

  it('stops a plain member editing the group', async () => {
    await assertFails(setDoc(doc(asBob(), 'groups', GROUP), { name: 'Renamed' }));
  });
});

describe('what the admin can do, and only the admin', () => {
  it('renames the group', async () => {
    await assertSucceeds(updateDoc(doc(asAlice(), 'groups', GROUP), { name: 'Renamed' }));
    await assertFails(updateDoc(doc(asBob(), 'groups', GROUP), { name: 'Nope' }));
  });

  it('deletes the group', async () => {
    await assertFails(deleteDoc(doc(asBob(), 'groups', GROUP)));
    await assertSucceeds(deleteDoc(doc(asAlice(), 'groups', GROUP)));
  });

  it('hands the group on by changing roles', async () => {
    await assertSucceeds(
      updateDoc(doc(asAlice(), 'groups', GROUP, 'members', BOB), { role: 'admin' }),
    );
    await assertSucceeds(updateDoc(doc(asAlice(), 'groups', GROUP), { adminUid: BOB }));
  });

  it('stops a member promoting themselves', async () => {
    // The one thing that would make the admin role meaningless.
    await assertFails(
      updateDoc(doc(asBob(), 'groups', GROUP, 'members', BOB), { role: 'admin' }),
    );
    await assertFails(updateDoc(doc(asBob(), 'groups', GROUP), { adminUid: BOB }));
  });

  it('removes another member', async () => {
    await assertSucceeds(deleteDoc(doc(asAlice(), 'groups', GROUP, 'members', BOB)));
  });

  it('stops a member removing anybody else', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'groups', GROUP, 'members', CAROL), {
        uid: CAROL, displayName: 'Carol', role: 'member', shareFlags: {},
      });
    });
    await assertFails(deleteDoc(doc(asBob(), 'groups', GROUP, 'members', CAROL)));
  });

  it('takes a removed member’s shared data with them', async () => {
    await assertSucceeds(
      deleteDoc(doc(asAlice(), 'groups', GROUP, 'members', BOB, 'shared', 'summary')),
    );
  });

  it('stops one member deleting another member’s shared data', async () => {
    await assertFails(
      deleteDoc(doc(asBob(), 'groups', GROUP, 'members', ALICE, 'shared', 'summary')),
    );
  });

  it('renames and deletes the invite, which a member cannot', async () => {
    await assertFails(
      updateDoc(doc(asBob(), 'inviteCodes', 'AB3K9P'), { name: 'Nope' }),
    );
    await assertSucceeds(
      updateDoc(doc(asAlice(), 'inviteCodes', 'AB3K9P'), { name: 'Renamed' }),
    );
    await assertSucceeds(deleteDoc(doc(asAlice(), 'inviteCodes', 'AB3K9P')));
  });

  it('gets no extra sight of anybody’s own data for being admin', async () => {
    // The whole point of replacing the coach role: an admin looks after the
    // group, and sees exactly what every other member sees.
    await assertFails(getDoc(doc(asAlice(), 'users', BOB)));
    await assertFails(getDoc(doc(asAlice(), 'users', BOB, 'days', '2026-03-04')));
    await assertFails(getDocs(query(collection(asAlice(), 'users', BOB, 'photos'))));
  });
});

describe('the shared mirror', () => {
  it('lets one member read another member mirror', async () => {
    await assertSucceeds(
      getDoc(doc(asAlice(), 'groups', GROUP, 'members', BOB, 'shared', 'summary')),
    );
  });

  it('stops a non-member reading a mirror', async () => {
    await assertFails(
      getDoc(doc(asCarol(), 'groups', GROUP, 'members', BOB, 'shared', 'summary')),
    );
  });

  it('lets a member write their own mirror', async () => {
    await assertSucceeds(
      setDoc(doc(asBob(), 'groups', GROUP, 'members', BOB, 'shared', 'summary'), {
        uid: BOB, displayName: 'Bob',
      }),
    );
  });

  it('stops a member writing someone else mirror', async () => {
    // Even the coach cannot put words in a member's mouth.
    await assertFails(
      setDoc(doc(asAlice(), 'groups', GROUP, 'members', BOB, 'shared', 'summary'), {
        uid: BOB, displayName: 'Bob', calories: { avgIntake: 99 },
      }),
    );
  });

  it('ends access the moment a member leaves', async () => {
    // Alice can read Bob's mirror...
    await assertSucceeds(
      getDoc(doc(asAlice(), 'groups', GROUP, 'members', BOB, 'shared', 'summary')),
    );
    // ...until Alice leaves the group herself.
    await assertSucceeds(deleteDoc(doc(asAlice(), 'groups', GROUP, 'members', ALICE)));
    await assertFails(
      getDoc(doc(asAlice(), 'groups', GROUP, 'members', BOB, 'shared', 'summary')),
    );
  });
});

describe('membership', () => {
  it('lets a user join by writing their own member record', async () => {
    await assertSucceeds(
      setDoc(doc(asCarol(), 'groups', GROUP, 'members', CAROL), {
        uid: CAROL, displayName: 'Carol', role: 'member', shareFlags: {},
      }),
    );
  });

  it('stops a user adding somebody else to a group', async () => {
    await assertFails(
      setDoc(doc(asBob(), 'groups', GROUP, 'members', CAROL), {
        uid: CAROL, displayName: 'Carol', role: 'member', shareFlags: {},
      }),
    );
  });

  it('stops a member forging the uid on their own record', async () => {
    await assertFails(
      setDoc(doc(asCarol(), 'groups', GROUP, 'members', CAROL), {
        uid: ALICE, displayName: 'Carol', role: 'member', shareFlags: {},
      }),
    );
  });

  it('stops a member promoting themselves to coach', async () => {
    await assertFails(
      setDoc(doc(asBob(), 'groups', GROUP, 'members', BOB), {
        uid: BOB, displayName: 'Bob', role: 'coach', shareFlags: {},
      }),
    );
  });

  it('lets a member change their own share settings', async () => {
    await assertSucceeds(
      setDoc(doc(asBob(), 'groups', GROUP, 'members', BOB), {
        uid: BOB, displayName: 'Bob', role: 'member', shareFlags: { calories: true },
      }),
    );
  });

  it('stops a plain member changing another member share settings', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'groups', GROUP, 'members', CAROL), {
        uid: CAROL, displayName: 'Carol', role: 'member', shareFlags: {},
      });
    });
    await assertFails(
      setDoc(doc(asCarol(), 'groups', GROUP, 'members', BOB), {
        uid: BOB, displayName: 'Bob', role: 'member', shareFlags: { photos: true },
      }),
    );
  });

  it('lets a plain member remove only themselves', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'groups', GROUP, 'members', CAROL), {
        uid: CAROL, displayName: 'Carol', role: 'member', shareFlags: {},
      });
    });
    await assertFails(deleteDoc(doc(asCarol(), 'groups', GROUP, 'members', BOB)));
    await assertSucceeds(deleteDoc(doc(asCarol(), 'groups', GROUP, 'members', CAROL)));
  });
});

describe('invite codes', () => {
  it('lets a signed-in user look up a code they know', async () => {
    await assertSucceeds(getDoc(doc(asCarol(), 'inviteCodes', 'AB3K9P')));
  });

  it('stops anyone enumerating codes', async () => {
    await assertFails(getDocs(query(collection(asCarol(), 'inviteCodes'))));
  });

  it('stops an anonymous visitor looking up a code', async () => {
    await assertFails(getDoc(doc(asAnon(), 'inviteCodes', 'AB3K9P')));
  });

  it('stops a code being repointed at another group', async () => {
    await assertFails(
      setDoc(doc(asCarol(), 'inviteCodes', 'AB3K9P'), {
        groupId: 'evil', name: 'Test group', createdBy: CAROL,
      }),
    );
  });
});

describe('the feed', () => {
  it('lets a member read the feed', async () => {
    await assertSucceeds(getDoc(doc(asAlice(), 'groups', GROUP, 'posts', 'p1')));
    await assertSucceeds(getDocs(query(collection(asAlice(), 'groups', GROUP, 'posts'))));
  });

  it('stops an outsider reading a single post or the whole feed', async () => {
    await assertFails(getDoc(doc(asCarol(), 'groups', GROUP, 'posts', 'p1')));
    await assertFails(getDocs(query(collection(asCarol(), 'groups', GROUP, 'posts'))));
    await assertFails(getDocs(query(collection(asAnon(), 'groups', GROUP, 'posts'))));
  });

  it('lets a member post in their own name', async () => {
    await assertSucceeds(
      setDoc(doc(asBob(), 'groups', GROUP, 'posts', 'p2'), {
        authorUid: BOB, authorName: 'Bob', kind: 'note', body: 'Hello',
        createdAt: new Date(),
      }),
    );
  });

  it('stops a member posting in somebody else’s name', async () => {
    await assertFails(
      setDoc(doc(asBob(), 'groups', GROUP, 'posts', 'p3'), {
        authorUid: ALICE, authorName: 'Alice', kind: 'note', body: 'Forged',
        createdAt: new Date(),
      }),
    );
  });

  it('stops an outsider posting at all', async () => {
    await assertFails(
      setDoc(doc(asCarol(), 'groups', GROUP, 'posts', 'p4'), {
        authorUid: CAROL, authorName: 'Carol', kind: 'note', createdAt: new Date(),
      }),
    );
  });

  it('lets an author delete their own post', async () => {
    await assertSucceeds(deleteDoc(doc(asBob(), 'groups', GROUP, 'posts', 'p1')));
  });

  it('lets the admin delete anybody’s post', async () => {
    await assertSucceeds(deleteDoc(doc(asAlice(), 'groups', GROUP, 'posts', 'p1')));
  });

  it('stops a plain member deleting somebody else’s post', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'groups', GROUP, 'members', CAROL), {
        uid: CAROL, displayName: 'Carol', role: 'member', shareFlags: {},
      });
    });
    // Carol is a member now, but not the author and not the admin.
    await assertFails(deleteDoc(doc(asCarol(), 'groups', GROUP, 'posts', 'p1')));
  });

  it('lets an author rewrite their own post', async () => {
    await assertSucceeds(
      updateDoc(doc(asBob(), 'groups', GROUP, 'posts', 'p1'), { body: 'Edited' }),
    );
  });

  it('stops an author wiping the reactions other people left', async () => {
    await assertFails(
      updateDoc(doc(asBob(), 'groups', GROUP, 'posts', 'p1'), { reactions: {} }),
    );
  });

  it('stops an author handing their post to somebody else', async () => {
    await assertFails(
      updateDoc(doc(asBob(), 'groups', GROUP, 'posts', 'p1'), { authorUid: ALICE }),
    );
  });

  it('stops a member rewriting somebody else’s post', async () => {
    await assertFails(
      updateDoc(doc(asAlice(), 'groups', GROUP, 'posts', 'p1'), { body: 'Hijacked' }),
    );
  });
});

describe('the new-posts marker', () => {
  it('lets any member say something was posted', async () => {
    await assertSucceeds(
      updateDoc(doc(asBob(), 'groups', GROUP), { lastPostAt: new Date() }),
    );
  });

  it('stops a member changing anything else on the group', async () => {
    await assertFails(
      updateDoc(doc(asBob(), 'groups', GROUP), {
        lastPostAt: new Date(), name: 'Hijacked',
      }),
    );
    await assertFails(updateDoc(doc(asBob(), 'groups', GROUP), { adminUid: BOB }));
  });

  it('stops an outsider touching it', async () => {
    await assertFails(
      updateDoc(doc(asCarol(), 'groups', GROUP), { lastPostAt: new Date() }),
    );
  });
});

describe('digests', () => {
  const digest = {
    authorUid: BOB,
    authorName: 'Bob',
    kind: 'digest',
    createdAt: new Date(),
    items: { workout: { kind: 'workout', headline: 'Finished Legs' } },
  };

  it('lets a member add a line to their own digest', async () => {
    await assertSucceeds(
      setDoc(doc(asBob(), 'groups', GROUP, 'posts', `digest_${BOB}_2026-11-09`), digest),
    );
    // And a second line merges onto the same card rather than making another.
    await assertSucceeds(
      setDoc(
        doc(asBob(), 'groups', GROUP, 'posts', `digest_${BOB}_2026-11-09`),
        { items: { weight: { kind: 'weight', headline: 'Down 1 kg this week' } } },
        { merge: true },
      ),
    );
  });

  it('stops a member adding a line to somebody else’s digest', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'groups', GROUP, 'posts', `digest_${BOB}_2026-11-09`),
        digest,
      );
    });
    await assertFails(
      updateDoc(
        doc(asAlice(), 'groups', GROUP, 'posts', `digest_${BOB}_2026-11-09`),
        { items: { workout: { kind: 'workout', headline: 'Forged' } } },
      ),
    );
  });

  it('lets a member prune their own lines, which is what unsharing does', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'groups', GROUP, 'posts', `digest_${BOB}_2026-11-09`),
        { ...digest, reactions: { [ALICE]: 'fire' } },
      );
    });
    // Taking the workout line off must not disturb the reactions on the card.
    await assertSucceeds(
      updateDoc(
        doc(asBob(), 'groups', GROUP, 'posts', `digest_${BOB}_2026-11-09`),
        { items: {} },
      ),
    );
    await assertSucceeds(
      deleteDoc(doc(asBob(), 'groups', GROUP, 'posts', `digest_${BOB}_2026-11-09`)),
    );
  });

  it('stops a digest being written in somebody else’s name', async () => {
    await assertFails(
      setDoc(doc(asAlice(), 'groups', GROUP, 'posts', `digest_${BOB}_2026-11-10`), digest),
    );
  });
});

describe('reactions', () => {
  it('lets a member add their own reaction to another member’s post', async () => {
    await assertSucceeds(
      updateDoc(doc(asAlice(), 'groups', GROUP, 'posts', 'p1'), {
        reactions: { [CAROL]: 'fire', [ALICE]: 'thumb' },
      }),
    );
  });

  it('lets a member take their own reaction off again', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'groups', GROUP, 'posts', 'p1'),
        { reactions: { [ALICE]: 'thumb' } },
        { merge: true },
      );
    });
    // Carol's stays; only Alice's own key may go.
    await assertSucceeds(
      updateDoc(doc(asAlice(), 'groups', GROUP, 'posts', 'p1'), {
        reactions: { [CAROL]: 'fire' },
      }),
    );
  });

  it('stops a member reacting on somebody else’s behalf', async () => {
    await assertFails(
      updateDoc(doc(asAlice(), 'groups', GROUP, 'posts', 'p1'), {
        reactions: { [CAROL]: 'fire', [BOB]: 'flex' },
      }),
    );
  });

  it('stops a member deleting somebody else’s reaction', async () => {
    await assertFails(
      updateDoc(doc(asAlice(), 'groups', GROUP, 'posts', 'p1'), { reactions: {} }),
    );
  });

  it('stops the reaction path being used to edit the post itself', async () => {
    await assertFails(
      updateDoc(doc(asAlice(), 'groups', GROUP, 'posts', 'p1'), {
        reactions: { [CAROL]: 'fire', [ALICE]: 'thumb' },
        body: 'Rewritten',
      }),
    );
  });

  it('stops an outsider reacting', async () => {
    await assertFails(
      updateDoc(doc(asCarol(), 'groups', GROUP, 'posts', 'p1'), {
        reactions: { [CAROL]: 'flex' },
      }),
    );
  });
});

describe('comments', () => {
  it('lets a member read and write comments in their own name', async () => {
    await assertSucceeds(
      getDocs(query(collection(asAlice(), 'groups', GROUP, 'posts', 'p1', 'comments'))),
    );
    await assertSucceeds(
      setDoc(doc(asAlice(), 'groups', GROUP, 'posts', 'p1', 'comments', 'c2'), {
        authorUid: ALICE, authorName: 'Alice', text: 'Well done', createdAt: new Date(),
      }),
    );
  });

  it('stops a member commenting in somebody else’s name', async () => {
    await assertFails(
      setDoc(doc(asAlice(), 'groups', GROUP, 'posts', 'p1', 'comments', 'c3'), {
        authorUid: BOB, authorName: 'Bob', text: 'Forged', createdAt: new Date(),
      }),
    );
  });

  it('stops an outsider reading or writing comments', async () => {
    await assertFails(
      getDocs(query(collection(asCarol(), 'groups', GROUP, 'posts', 'p1', 'comments'))),
    );
    await assertFails(
      setDoc(doc(asCarol(), 'groups', GROUP, 'posts', 'p1', 'comments', 'c4'), {
        authorUid: CAROL, authorName: 'Carol', text: 'Nope', createdAt: new Date(),
      }),
    );
  });

  it('lets the author delete their own comment', async () => {
    await assertSucceeds(
      deleteDoc(doc(asBob(), 'groups', GROUP, 'posts', 'p1', 'comments', 'c1')),
    );
  });

  it('lets the admin delete anybody’s comment', async () => {
    await assertSucceeds(
      deleteDoc(doc(asAlice(), 'groups', GROUP, 'posts', 'p1', 'comments', 'c1')),
    );
  });

  it('stops a plain member deleting somebody else’s comment', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'groups', GROUP, 'members', CAROL), {
        uid: CAROL, displayName: 'Carol', role: 'member', shareFlags: {},
      });
    });
    await assertFails(
      deleteDoc(doc(asCarol(), 'groups', GROUP, 'posts', 'p1', 'comments', 'c1')),
    );
  });

  it('stops anybody editing a comment after the fact', async () => {
    await assertFails(
      updateDoc(doc(asBob(), 'groups', GROUP, 'posts', 'p1', 'comments', 'c1'), {
        text: 'Changed',
      }),
    );
    await assertFails(
      updateDoc(doc(asAlice(), 'groups', GROUP, 'posts', 'p1', 'comments', 'c1'), {
        text: 'Changed',
      }),
    );
  });
});

describe('nudges', () => {
  const nudge = (from: string, to: string) => ({
    groupId: GROUP,
    groupName: 'Test group',
    fromUid: from,
    fromName: from,
    toUid: to,
    day: '2026-11-09',
    seen: false,
    createdAt: new Date(),
  });

  it('lets one member nudge another', async () => {
    await assertSucceeds(
      setDoc(doc(asAlice(), 'groups', GROUP, 'nudges', `${BOB}_2026-11-09`),
        nudge(ALICE, BOB)),
    );
  });

  it('stops a nudge being sent in somebody else’s name', async () => {
    await assertFails(
      setDoc(doc(asAlice(), 'groups', GROUP, 'nudges', `${BOB}_2026-11-09`),
        nudge(BOB, BOB)),
    );
  });

  it('stops anybody nudging themselves', async () => {
    await assertFails(
      setDoc(doc(asAlice(), 'groups', GROUP, 'nudges', `${ALICE}_2026-11-09`),
        nudge(ALICE, ALICE)),
    );
  });

  it('stops an outsider nudging into the group', async () => {
    await assertFails(
      setDoc(doc(asCarol(), 'groups', GROUP, 'nudges', `${BOB}_2026-11-09`),
        nudge(CAROL, BOB)),
    );
  });

  it('stops a nudge arriving pre-read', async () => {
    await assertFails(
      setDoc(doc(asAlice(), 'groups', GROUP, 'nudges', `${BOB}_2026-11-09`),
        { ...nudge(ALICE, BOB), seen: true }),
    );
  });

  it('allows only one per person per day, enforced by the database', async () => {
    await assertSucceeds(
      setDoc(doc(asAlice(), 'groups', GROUP, 'nudges', `${BOB}_2026-11-09`),
        nudge(ALICE, BOB)),
    );
    // The second is an update of a document that exists, and nothing grants
    // that to the sender — not even to a different sender.
    await assertFails(
      setDoc(doc(asAlice(), 'groups', GROUP, 'nudges', `${BOB}_2026-11-09`),
        nudge(ALICE, BOB)),
    );
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'groups', GROUP, 'members', CAROL), {
        uid: CAROL, displayName: 'Carol', role: 'member', shareFlags: {},
      });
    });
    await assertFails(
      setDoc(doc(asCarol(), 'groups', GROUP, 'nudges', `${BOB}_2026-11-09`),
        nudge(CAROL, BOB)),
    );
  });

  it('lets the person nudged mark it read, and nobody else', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'groups', GROUP, 'nudges', `${BOB}_2026-11-09`),
        nudge(ALICE, BOB),
      );
    });
    await assertFails(
      updateDoc(doc(asAlice(), 'groups', GROUP, 'nudges', `${BOB}_2026-11-09`),
        { seen: true }),
    );
    await assertSucceeds(
      updateDoc(doc(asBob(), 'groups', GROUP, 'nudges', `${BOB}_2026-11-09`),
        { seen: true }),
    );
  });

  it('stops the recipient rewriting anything but the seen flag', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'groups', GROUP, 'nudges', `${BOB}_2026-11-09`),
        nudge(ALICE, BOB),
      );
    });
    await assertFails(
      updateDoc(doc(asBob(), 'groups', GROUP, 'nudges', `${BOB}_2026-11-09`),
        { seen: true, fromName: 'Someone else' }),
    );
  });

  it('lets a user find the nudges addressed to them, wherever they are', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'groups', GROUP, 'nudges', `${BOB}_2026-11-09`),
        nudge(ALICE, BOB),
      );
    });
    await assertSucceeds(
      getDocs(query(
        collectionGroup(asBob(), 'nudges'),
        where('toUid', '==', BOB),
        where('seen', '==', false),
      )),
    );
  });

  it('stops that same query being pointed at somebody else', async () => {
    await assertFails(
      getDocs(query(
        collectionGroup(asAlice(), 'nudges'),
        where('toUid', '==', BOB),
        where('seen', '==', false),
      )),
    );
    // And an unfiltered sweep of every nudge in the database is refused too.
    await assertFails(getDocs(query(collectionGroup(asBob(), 'nudges'))));
  });
});

describe('leaving a group', () => {
  it('ends access to the feed the moment the member record goes', async () => {
    await assertSucceeds(getDoc(doc(asBob(), 'groups', GROUP, 'posts', 'p1')));
    await assertSucceeds(deleteDoc(doc(asBob(), 'groups', GROUP, 'members', BOB)));

    await assertFails(getDoc(doc(asBob(), 'groups', GROUP, 'posts', 'p1')));
    await assertFails(getDoc(doc(asBob(), 'groups', GROUP)));
    await assertFails(
      getDocs(query(collection(asBob(), 'groups', GROUP, 'posts', 'p1', 'comments'))),
    );
  });

  it('lets a member clear their own posts on the way out', async () => {
    // Which is how "leaving removes your posts" is carried out: the member
    // deletes them while they still have permission to.
    await assertSucceeds(
      getDocs(query(
        collection(asBob(), 'groups', GROUP, 'posts'),
        where('authorUid', '==', BOB),
      )),
    );
    await assertSucceeds(deleteDoc(doc(asBob(), 'groups', GROUP, 'posts', 'p1')));
  });

  it('stops a removed member reading anything they used to', async () => {
    await assertSucceeds(deleteDoc(doc(asAlice(), 'groups', GROUP, 'members', BOB)));
    await assertFails(
      getDoc(doc(asBob(), 'groups', GROUP, 'members', ALICE, 'shared', 'summary')),
    );
  });
});
