// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression: characters.federation_consent must gate ActivityPub work
 * (BUG-character-federation-lacks-owner-consent-or-nsfw-gate). Migration
 * 069 added the column but nothing reads it; this service is the gate
 * that AP key generation calls before minting a signing keypair.
 *
 * Uses the full test DB (runs every migration) so the schema includes
 * characters.federation_consent and actor FK chains, mirroring prod.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertCharacters, insertUsers, } from "../../test-utils/insert-helpers";
import {
  assertFederationConsent,
  FederationConsentError,
  getFederationConsent,
  setFederationConsent,
} from "./federation-consent";

let tdb: TestDb;
let db: Kysely<DB>;

beforeEach(async () => {
  tdb = await createTestDb();
  db = tdb.db;
  await insertUsers(db, "u1", "User One", { id: "u1" as never, },);
  await insertUsers(db, "u2", "User Two", { id: "u2" as never, },);
  await insertCharacters(db, "u1", "Char One", { id: "char-1" as never, },);
  await insertCharacters(db, "u2", "Char Two", { id: "char-2" as never, },);
  // char-2 opts in; char-1 stays default (off).
  await setFederationConsent(db, "char-2", true,);
},);

afterEach(async () => {
  await db.destroy();
},);

describe("federation-consent gate", () => {
  test("default consent is false (BUG-character-federation-lacks-owner-consent-or-nsfw-gate)", async () => {
    expect(await getFederationConsent(db, "char-1",),).toBe(false,);
  });

  test("getFederationConsent reflects the boolean state", async () => {
    expect(await getFederationConsent(db, "char-1",),).toBe(false,);
    expect(await getFederationConsent(db, "char-2",),).toBe(true,);
  });

  test("assertFederationConsent throws FederationConsentError when off", async () => {
    await expect(assertFederationConsent(db, "char-1",),).rejects.toBeInstanceOf(
      FederationConsentError,
    );
  });

  test("assertFederationConsent resolves when on", async () => {
    await expect(assertFederationConsent(db, "char-2",),).resolves.toBeUndefined();
  });

  test("assertFederationConsent throws for missing actor (no silent allow)", async () => {
    await expect(assertFederationConsent(db, "missing",),).rejects.toBeInstanceOf(
      FederationConsentError,
    );
  });

  test("setFederationConsent flips the flag", async () => {
    await setFederationConsent(db, "char-1", true,);
    expect(await getFederationConsent(db, "char-1",),).toBe(true,);
    await expect(assertFederationConsent(db, "char-1",),).resolves.toBeUndefined();
    await setFederationConsent(db, "char-1", false,);
    expect(await getFederationConsent(db, "char-1",),).toBe(false,);
  });
});
