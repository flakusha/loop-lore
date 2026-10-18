// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The shared workload token read-back path. Two things must hold at once: a
 * peer with no stored token never authenticates (fail closed), and the
 * plaintext never leaves the module.
 */
import { describe, expect, test, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { setPeerState, upsertPeer, } from "./coordinator";
import { savePeerWorkload, } from "./peer-registry";
import { readPeerWorkloadToken, verifyPeerWorkloadToken, } from "./peer-workload-token";

const SECRET = "peer-workload-secret-0123456789";
const LOOPBACK = "http://127.0.0.1:4010";
const TOKEN = "never-log-me-9f2b";
async function seeded() {
  const { db, } = await createTestDb();
  await savePeerWorkload(db, { origin: LOOPBACK, sharedToken: TOKEN, encryptionKey: SECRET, },);
  await setPeerState(db, LOOPBACK, "trusted",);
  return { db, };
}

describe("readPeerWorkloadToken", () => {
  test("decrypts the stored token under the server secret", async () => {
    const { db, } = await seeded();
    expect(await readPeerWorkloadToken(db, { origin: LOOPBACK, encryptionKey: SECRET, },),).toBe(TOKEN,);
  });

  test("an unknown peer has no token", async () => {
    const { db, } = await seeded();
    expect(await readPeerWorkloadToken(db, { origin: "http://127.0.0.1:4999", encryptionKey: SECRET, },),).toBeNull();
  });

  test("a peer saved without a token has none", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: "https://gpu.example", state: "trusted", },);
    expect(await readPeerWorkloadToken(db, { origin: "https://gpu.example", encryptionKey: SECRET, },),).toBeNull();
  });

  test("the wrong server secret fails loudly rather than yielding plaintext", async () => {
    const { db, } = await seeded();
    expect(readPeerWorkloadToken(db, { origin: LOOPBACK, encryptionKey: "a-different-secret-0123456789", },),).rejects
      .toThrow();
  });
});

describe("verifyPeerWorkloadToken", () => {
  test("accepts the exact stored token", async () => {
    const { db, } = await seeded();
    expect(await verifyPeerWorkloadToken(db, { origin: LOOPBACK, presented: TOKEN, encryptionKey: SECRET, },),).toBe(
      true,
    );
  });

  test("rejects a wrong, truncated, padded or case-shifted token", async () => {
    const { db, } = await seeded();
    for (const presented of ["wrong", TOKEN.slice(0, -1,), ` ${TOKEN}`, TOKEN.toUpperCase(),]) {
      expect(await verifyPeerWorkloadToken(db, { origin: LOOPBACK, presented, encryptionKey: SECRET, },),).toBe(false,);
    }
  });

  test("fails closed for a missing, empty or non-string bearer", async () => {
    const { db, } = await seeded();
    for (const presented of [null, undefined, "", 42, {},]) {
      expect(
        await verifyPeerWorkloadToken(db, { origin: LOOPBACK, presented: presented as never, encryptionKey: SECRET, },),
      ).toBe(false,);
    }
  });

  test("fails closed for an unknown peer however good the presented token is", async () => {
    const { db, } = await seeded();
    expect(
      await verifyPeerWorkloadToken(db, { origin: "http://127.0.0.1:4999", presented: TOKEN, encryptionKey: SECRET, },),
    ).toBe(false,);
  });
});
