// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Offline BYOK rotation — fail-closed behavior against in-memory SQLite.
 * No network, no real database files.
 */

import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import {
  BYOK_KEY_VERSION,
  decryptValue,
  deriveUserKek,
  encryptValue,
  encryptVersioned,
  kekAad,
} from "../src/crypto";
import { createSqliteDialect, } from "../src/db/index";
import type { DB, } from "../src/db/schema";
import { rotateByokSecrets, } from "./byok-rotate";

const OLD = "old-master-secret";
const NEW = "new-master-secret";
const WRONG = "wrong-master-secret";
const USER_ID = "user-1";
const PROVIDER = "openai";
const LEGACY_PROVIDER = "anthropic";
const V3_PLAINTEXT = "sk-v3-value";
const LEGACY_PLAINTEXT = "sk-legacy-value";
const MESH_PLAINTEXT = "mesh-token-value";

let raw: Database;
let db: Kysely<DB>;

beforeEach(() => {
  raw = new Database(":memory:",);
  raw.exec(`
    CREATE TABLE user_api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider_name TEXT NOT NULL,
      api_key_encrypted TEXT NOT NULL,
      key_version INTEGER NOT NULL
    );
    CREATE TABLE mesh_peers (
      origin TEXT PRIMARY KEY,
      shared_token_enc TEXT,
      key_version INTEGER NOT NULL
    );
  `,);
  db = new Kysely<DB>({ dialect: createSqliteDialect(raw,), },);
},);

afterEach(async () => {
  await db.destroy();
  raw.close();
},);

/** One current KEK-sealed row, one legacy global-secret row, one mesh token
 * plus one mesh row with no token (must be skipped). */
async function seed(): Promise<void> {
  await db
    .insertInto("user_api_keys",)
    .values([
      {
        id: "row-v3",
        user_id: USER_ID,
        provider_name: PROVIDER,
        api_key_encrypted: await encryptVersioned(
          V3_PLAINTEXT,
          await deriveUserKek(OLD, USER_ID,),
          kekAad(USER_ID, PROVIDER,),
        ),
        key_version: BYOK_KEY_VERSION,
      },
      {
        id: "row-legacy",
        user_id: USER_ID,
        provider_name: LEGACY_PROVIDER,
        api_key_encrypted: await encryptValue(LEGACY_PLAINTEXT, OLD,),
        key_version: 1,
      },
    ],)
    .execute();

  raw
    .query("INSERT INTO mesh_peers (origin, shared_token_enc, key_version) VALUES (?, ?, ?)",)
    .run("peer-1", await encryptValue(MESH_PLAINTEXT, OLD,), 1,);
  raw
    .query("INSERT INTO mesh_peers (origin, shared_token_enc, key_version) VALUES (?, ?, ?)",)
    .run("peer-no-token", null, 1,);
}

async function snapshot() {
  return {
    users: await db.selectFrom("user_api_keys",).selectAll().orderBy("id",).execute(),
    peers: await db.selectFrom("mesh_peers",).selectAll().orderBy("origin",).execute(),
  };
}

describe("rotateByokSecrets", () => {
  test("re-seals every row under the new secret and stamps the current key version", async () => {
    await seed();

    const result = await rotateByokSecrets({ database: db, oldSecret: OLD, newSecret: NEW, },);

    expect(result,).toEqual({
      usersReencrypted: 2,
      peersReencrypted: 1,
      failures: [],
    },);

    const users = await db.selectFrom("user_api_keys",).selectAll().execute();
    const byId = new Map(users.map((row,) => [row.id, row,]),);

    const v3 = byId.get("row-v3",)!;
    expect(v3.key_version,).toBe(BYOK_KEY_VERSION,);
    expect(
      await decryptValue(
        v3.api_key_encrypted,
        await deriveUserKek(NEW, USER_ID,),
        kekAad(USER_ID, PROVIDER,),
      ),
    ).toBe(V3_PLAINTEXT,);
    await expect(
      decryptValue(
        v3.api_key_encrypted,
        await deriveUserKek(OLD, USER_ID,),
        kekAad(USER_ID, PROVIDER,),
      ),
    ).rejects.toThrow();

    const legacy = byId.get("row-legacy",)!;
    expect(legacy.key_version,).toBe(BYOK_KEY_VERSION,);
    expect(
      await decryptValue(
        legacy.api_key_encrypted,
        await deriveUserKek(NEW, USER_ID,),
        kekAad(USER_ID, LEGACY_PROVIDER,),
      ),
    ).toBe(LEGACY_PLAINTEXT,);

    const peers = await db.selectFrom("mesh_peers",).selectAll().orderBy("origin",).execute();
    const peer = peers.find((row,) => row.origin === "peer-1")!;
    expect(peer.key_version,).toBe(BYOK_KEY_VERSION,);
    expect(await decryptValue(peer.shared_token_enc!, NEW,),).toBe(MESH_PLAINTEXT,);
    expect(peers.find((row,) => row.origin === "peer-no-token")!.shared_token_enc,).toBeNull();
  });

  test("wrong old secret fails every row closed and leaves rows byte-identical", async () => {
    await seed();
    const before = await snapshot();

    const result = await rotateByokSecrets({ database: db, oldSecret: WRONG, newSecret: NEW, },);

    expect(result.usersReencrypted,).toBe(0,);
    expect(result.peersReencrypted,).toBe(0,);
    expect(result.failures,).toHaveLength(3,);
    expect(new Set(result.failures.map((failure,) => failure.table),),).toEqual(
      new Set(["user_api_keys", "mesh_peers",],),
    );
    expect(await snapshot(),).toEqual(before,);
  });

  test("an unknown version tag surfaces as a failure and leaves that row untouched", async () => {
    await seed();
    await db
      .updateTable("user_api_keys",)
      .set({ api_key_encrypted: `v99:${await encryptValue(V3_PLAINTEXT, OLD,)}`, },)
      .where("id", "=", "row-v3",)
      .execute();
    const before = await snapshot();

    const result = await rotateByokSecrets({ database: db, oldSecret: OLD, newSecret: NEW, },);

    expect(result.usersReencrypted,).toBe(1,);
    expect(result.peersReencrypted,).toBe(1,);
    expect(result.failures,).toHaveLength(1,);
    expect(result.failures[0]!.table,).toBe("user_api_keys",);
    expect(result.failures[0]!.id,).toBe("row-v3",);
    expect(result.failures[0]!.reason,).toContain("Unsupported BYOK key version: 99",);

    const after = await snapshot();
    expect(
      after.users.find((row,) => row.id === "row-v3"),
    ).toEqual(before.users.find((row,) => row.id === "row-v3"),);
  });
});
