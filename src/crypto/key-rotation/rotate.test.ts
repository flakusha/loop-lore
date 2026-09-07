// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for crypto/key-rotation/rotate.ts — rotateActorKey
 * (BUG-crypto-rotateactorkeyandreencrypt-returns-sentinel-string-ro).
 *
 * Pins the contract:
 * - oldKeyId is the actor's pre-rotation primary/active key id (or "unknown"
 *   when no prior key exists). It must NOT be a hardcoded sentinel like
 *   "rotated".
 * - messagesReEncrypted is always 0 (stable per-chat keys; no re-encrypt).
 */
import { afterAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { generateActorKey, } from "../actor-keys";
import { getSmk, initSmk, } from "../smk";
import { rotateActorKey, } from "./rotate";

const VALID_HEX_KEY = "a".repeat(64,);

let db: Kysely<DB>;

beforeEach(async () => {
  const dbHandle = await createTestDb();
  db = dbHandle.db;
  await initSmk({
    serverEncryptionKey: VALID_HEX_KEY,
    required: false,
    compressThreshold: 128,
    compressAlgorithm: "gzip",
  },);
},);

afterAll(async () => {
  await db.destroy();
},);

/** */
function getSmkKeySafe(): CryptoKey {
  const key = getSmk();
  if (!key) { throw new Error("SMK not loaded — test setup failed",); }
  return key;
}

/**
 * @param label
 */
async function setupActor(
  label: string,
): Promise<{ actorId: string; smk: CryptoKey }> {
  const smk = getSmkKeySafe();
  const actorId = `actor-${label}`;
  await db
    .insertInto("actors",)
    .values({
      id: actorId,
      actor_type: "character",
      display_name: label,
      user_id: null,
      owner_id: null,
      agent_type: "ai",
      settings: "{}",
      format_version: 0,
      visibility: "private",
      import_spec: "{}",
    },)
    .execute();
  await generateActorKey({
    database: db,
    actorId,
    smk,
    name: "primary",
  },);
  return { actorId, smk };
}

describe("rotateActorKey (BUG-crypto-...sentinel)", () => {
  test("returns the REAL pre-rotation key id, not a sentinel string", async () => {
    const { actorId, smk } = await setupActor("rot-real");
    const preKeys = await db
      .selectFrom("actor_keys",)
      .select("id",)
      .where("actor_id", "=", actorId,)
      .execute();
    const expectedOldId = preKeys[0]?.id ?? "";
    expect(expectedOldId,).not.toBe("rotated",);
    expect(expectedOldId,).not.toBe("unknown",);

    const result = await rotateActorKey(db, actorId, smk,);

    expect(result.actorId,).toBe(actorId,);
    expect(result.oldKeyId,).toBe(expectedOldId,);
    expect(result.oldKeyId,).not.toBe("rotated",);
    expect(result.newKeyId,).not.toBe(expectedOldId,);
  });

  test("messagesReEncrypted is always 0 (stable per-chat keys)", async () => {
    const { actorId, smk } = await setupActor("rot-no-msg");
    const result = await rotateActorKey(db, actorId, smk,);
    expect(result.messagesReEncrypted,).toBe(0,);
  });

  test("oldKeyId returns 'unknown' when actor has no primary/active key (never the sentinel)", async () => {
    const { actorId, smk } = await setupActor("rot-no-key");
    await db
      .updateTable("actor_keys",)
      .set({ status: "expired", },)
      .where("actor_id", "=", actorId,)
      .execute();

    const result = await rotateActorKey(db, actorId, smk,);
    expect(result.oldKeyId,).toBe("unknown",);
    expect(result.oldKeyId,).not.toBe("rotated",);
  });
});
