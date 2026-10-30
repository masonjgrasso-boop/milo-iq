// Storage security rule tests.
//
// Progress photos are the most sensitive thing the app holds, so these check
// that nobody but the owner can reach them, and that the size and type limits
// actually bite.

import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';

const ALICE = 'alice';
const BOB = 'bob';
const PHOTO = `users/${ALICE}/photos/2026-W10/full.jpg`;

let testEnv: RulesTestEnvironment;

const jpeg = (bytes: number) => new Uint8Array(bytes).fill(1);
const meta = { contentType: 'image/jpeg' };

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'milo-iq-rules-test',
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(context.storage(), PHOTO), jpeg(1024), meta);
  });
});

describe('progress photos', () => {
  it('lets the owner upload a photo', async () => {
    const storage = testEnv.authenticatedContext(ALICE).storage();
    await assertSucceeds(uploadBytes(ref(storage, PHOTO), jpeg(2048), meta));
  });

  it('lets the owner read their own photo', async () => {
    const storage = testEnv.authenticatedContext(ALICE).storage();
    await assertSucceeds(getBytes(ref(storage, PHOTO)));
  });

  it('lets the owner delete their own photo', async () => {
    const storage = testEnv.authenticatedContext(ALICE).storage();
    await assertSucceeds(deleteObject(ref(storage, PHOTO)));
  });

  it('stops another signed-in user reading it', async () => {
    const storage = testEnv.authenticatedContext(BOB).storage();
    await assertFails(getBytes(ref(storage, PHOTO)));
  });

  it('stops another signed-in user overwriting it', async () => {
    const storage = testEnv.authenticatedContext(BOB).storage();
    await assertFails(uploadBytes(ref(storage, PHOTO), jpeg(1024), meta));
  });

  it('stops another signed-in user deleting it', async () => {
    const storage = testEnv.authenticatedContext(BOB).storage();
    await assertFails(deleteObject(ref(storage, PHOTO)));
  });

  it('stops an anonymous visitor reading it', async () => {
    const storage = testEnv.unauthenticatedContext().storage();
    await assertFails(getBytes(ref(storage, PHOTO)));
  });
});

describe('upload limits', () => {
  it('rejects a file that is not an image', async () => {
    const storage = testEnv.authenticatedContext(ALICE).storage();
    await assertFails(
      uploadBytes(ref(storage, PHOTO), jpeg(1024), { contentType: 'application/pdf' }),
    );
  });

  it('rejects an oversized upload', async () => {
    // Photos are compressed to roughly 200KB on the device, so anything over
    // 2MB is not a progress photo.
    const storage = testEnv.authenticatedContext(ALICE).storage();
    await assertFails(uploadBytes(ref(storage, PHOTO), jpeg(3 * 1024 * 1024), meta));
  });

  it('accepts a normally sized photo', async () => {
    const storage = testEnv.authenticatedContext(ALICE).storage();
    await assertSucceeds(uploadBytes(ref(storage, PHOTO), jpeg(200 * 1024), meta));
  });
});

describe('paths outside a user photo folder', () => {
  it('denies writes anywhere else', async () => {
    const storage = testEnv.authenticatedContext(ALICE).storage();
    await assertFails(uploadBytes(ref(storage, 'public/anything.jpg'), jpeg(512), meta));
    await assertFails(
      uploadBytes(ref(storage, `users/${ALICE}/secrets/key.jpg`), jpeg(512), meta),
    );
  });
});
