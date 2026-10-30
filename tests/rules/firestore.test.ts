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
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query } from 'firebase/firestore';

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
      name: 'Test group', inviteCode: 'AB3K9P', coachUid: ALICE, createdBy: ALICE,
    });
    await setDoc(doc(db, 'groups', GROUP, 'members', ALICE), {
      uid: ALICE, displayName: 'Alice', role: 'coach', shareFlags: {},
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

  it('lets a user create a group they own', async () => {
    await assertSucceeds(
      setDoc(doc(asCarol(), 'groups', 'new1'), {
        name: 'Carol group', inviteCode: 'XY7M2Q', coachUid: null, createdBy: CAROL,
      }),
    );
  });

  it('stops a user creating a group attributed to someone else', async () => {
    await assertFails(
      setDoc(doc(asCarol(), 'groups', 'new2'), {
        name: 'Fake', inviteCode: 'XY7M2R', coachUid: null, createdBy: ALICE,
      }),
    );
  });

  it('stops a non-coach member editing the group', async () => {
    await assertFails(setDoc(doc(asBob(), 'groups', GROUP), { name: 'Renamed' }));
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

  it('stops a member changing another member share settings', async () => {
    await assertFails(
      setDoc(doc(asAlice(), 'groups', GROUP, 'members', BOB), {
        uid: BOB, displayName: 'Bob', role: 'member', shareFlags: { photos: true },
      }),
    );
  });

  it('lets a member remove only themselves', async () => {
    await assertFails(deleteDoc(doc(asAlice(), 'groups', GROUP, 'members', BOB)));
    await assertSucceeds(deleteDoc(doc(asBob(), 'groups', GROUP, 'members', BOB)));
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

describe('coach notes', () => {
  it('lets the coach write a note', async () => {
    await assertSucceeds(
      setDoc(doc(asAlice(), 'groups', GROUP, 'notes', 'n1'), {
        coachUid: ALICE, memberUid: BOB, text: 'Good week',
      }),
    );
  });

  it('stops a plain member writing a note', async () => {
    await assertFails(
      setDoc(doc(asBob(), 'groups', GROUP, 'notes', 'n2'), {
        coachUid: BOB, memberUid: ALICE, text: 'Nope',
      }),
    );
  });

  it('stops a note being attributed to another coach', async () => {
    await assertFails(
      setDoc(doc(asAlice(), 'groups', GROUP, 'notes', 'n3'), {
        coachUid: BOB, memberUid: BOB, text: 'Forged',
      }),
    );
  });

  it('lets the member a note is about read it', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'groups', GROUP, 'notes', 'n4'), {
        coachUid: ALICE, memberUid: BOB, text: 'For Bob',
      });
    });
    await assertSucceeds(getDoc(doc(asBob(), 'groups', GROUP, 'notes', 'n4')));
  });

  it('stops an outsider reading notes', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'groups', GROUP, 'notes', 'n5'), {
        coachUid: ALICE, memberUid: BOB, text: 'Private',
      });
    });
    await assertFails(getDoc(doc(asCarol(), 'groups', GROUP, 'notes', 'n5')));
  });
});
