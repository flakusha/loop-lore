// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Local WebFinger lookups: which of THIS instance's characters answer for a
 * `resource`, and which never do.
 *
 * The route is unauthenticated, so the miss cases are as load-bearing as the
 * hit: a foreign host, an opt-out character, a shared slug, and a malformed
 * actor URI must all be a plain miss (never a 500, never a disclosure).
 *
 * RESOURCE CONTRACT (parallel-safe): each test owns a FRESH in-memory SQLite
 * fixture created in `beforeEach` and destroyed in `afterEach` (guarded, so a
 * throwing `beforeEach` cannot leak a handle). No port, no file, no
 * `setTestDatabase` global override — sibling files are unaffected.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { insertCharacters, insertUsers, } from "../test-utils/insert-helpers";
import { LOCAL_ACTOR_PATH, resolveLocalActor, } from "./local-webfinger";

const ORIGIN = "https://lore.example";

let tdb: TestDb | undefined;
let db: Kysely<DB>;

beforeEach(async () => {
  tdb = await createTestDb();
  db = tdb.db;
  await insertUsers(db, "u1", "User One", { id: "u1" as never, },);
  await insertCharacters(db, "u1", "Alice", { id: "char-alice" as never, federation_consent: 1, },);
  await insertCharacters(db, "u1", "Bob", { id: "char-bob" as never, },);
},);

afterEach(async () => {
  const fixture = tdb;
  tdb = undefined;
  if (fixture) { await destroyTestDb(fixture,); }
},);

describe("resolveLocalActor", () => {
  test("answers a handle with an acct subject and an absolute actor URI", async () => {
    const match = await resolveLocalActor({ database: db, origin: ORIGIN, resource: "acct:alice@lore.example", },);

    expect(match?.subject,).toBe("acct:alice@lore.example",);
    expect(match?.actorUri,).toBe(`${ORIGIN}${LOCAL_ACTOR_PATH}/char-alice`,);
    // The JRD is the wire form; its self link must be the same actor URI.
    expect(match?.jrd.links,).toEqual([
      { rel: "self", type: "application/activity+json", href: match?.actorUri, },
    ],);
  });

  test("LOCAL_ACTOR_PATH is the `/users` prefix the actor URIs use", () => {
    expect(LOCAL_ACTOR_PATH,).toBe("/users",);
    expect(LOCAL_ACTOR_PATH.startsWith("/",),).toBe(true,);
  });

  test("matches the handle host case-insensitively and ignores a trailing slash on the origin", async () => {
    const match = await resolveLocalActor({
      database: db,
      origin: "https://LORE.example/",
      resource: "acct:Alice@Lore.Example",
    },);

    expect(match?.subject,).toBe("acct:alice@lore.example",);
    expect(match?.actorUri,).toBe(`https://LORE.example${LOCAL_ACTOR_PATH}/char-alice`,);
  });

  test("answers the actor-URI form of the same character", async () => {
    const match = await resolveLocalActor({
      database: db,
      origin: ORIGIN,
      resource: `${ORIGIN}/users/char-alice`,
    },);

    expect(match?.subject,).toBe("acct:alice@lore.example",);
  });

  test("a character without federation consent is not published", async () => {
    expect(
      await resolveLocalActor({ database: db, origin: ORIGIN, resource: "acct:bob@lore.example", },),
    ).toBeNull();

    expect(
      await resolveLocalActor({ database: db, origin: ORIGIN, resource: `${ORIGIN}/users/char-bob`, },),
    ).toBeNull();
  });

  test("a foreign host never resolves, in either resource form", async () => {
    expect(
      await resolveLocalActor({ database: db, origin: ORIGIN, resource: "acct:alice@other.example", },),
    ).toBeNull();

    expect(
      await resolveLocalActor({
        database: db,
        origin: ORIGIN,
        resource: `https://other.example/users/char-alice`,
      },),
    ).toBeNull();
  });

  test("a shared slug is a miss rather than a disclosure", async () => {
    // `Alice!` slugs to the same `alice` handle as `Alice`.
    await insertCharacters(db, "u1", "Alice!", { id: "char-alice-2" as never, federation_consent: 1, },);

    expect(
      await resolveLocalActor({ database: db, origin: ORIGIN, resource: "acct:alice@lore.example", },),
    ).toBeNull();

    // The unambiguous id form still resolves exactly one character.
    expect(
      (await resolveLocalActor({ database: db, origin: ORIGIN, resource: `${ORIGIN}/users/char-alice`, },))
        ?.subject,
    ).toBe("acct:alice@lore.example",);
  });

  test("malformed or out-of-shape resources are misses, never throws", async () => {
    for (
      const resource of [
        "",
        "not a resource",
        `${ORIGIN}/users/`,
        `${ORIGIN}/users/char-alice/extra`,
        `${ORIGIN}/users/%ZZ`,
        `${ORIGIN}/characters/char-alice`,
        "acct:@lore.example",
      ]
    ) {
      expect(await resolveLocalActor({ database: db, origin: ORIGIN, resource, },),).toBeNull();
    }
  });

  test("an unparsable origin is a miss", async () => {
    expect(
      await resolveLocalActor({ database: db, origin: "not-an-origin", resource: "acct:alice@lore.example", },),
    ).toBeNull();
  });
});
