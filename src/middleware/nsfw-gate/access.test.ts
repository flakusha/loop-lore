// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Moderation-state enforcement in the NSFW base gate.
 *
 * `canAccessNsfw` is the single choke point for route-layer
 * (`requireNsfwRouteAccess`, `checkNsfwWithConsent`) and generation-layer
 * (`checkNsfwEligibility`) NSFW decisions: a blocked/banned
 * `access_status` must deny regardless of age, config, or consent.
 */
import type { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema/config";
import { NsfwSection, } from "../../config/sections";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { NsfwModerationService, } from "../../nsfw/moderation-service";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import { insertNsfwUserPreferences, insertUsers, } from "../../test-utils/insert-helpers";
import { canAccessNsfw, } from "./access";

/** */
function makeConfig(): Config {
  return { nsfw: new NsfwSection({},), } as unknown as Config;
}

async function seedAdult(db: Kysely<DB>, id: string,): Promise<void> {
  await insertUsers(db, id, id, {
    id: id as never,
    birth_date: "1990-01-01",
    age_gate_accepted_at: "2026-01-01T00:00:00Z",
  },);
}

describe("canAccessNsfw moderation state", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());
  },);

  afterEach(() => {
    resetTestDb(sqlite,);
  },);

  test("banned user is denied", async () => {
    await seedAdult(db, "u-banned",);
    await insertNsfwUserPreferences(db, "u-banned", { access_status: "banned" as never, },);
    const result = await canAccessNsfw(db, makeConfig(), "u-banned",);
    expect(result,).toEqual({ allowed: false, reason: "banned", },);
  });

  test("blocked user is denied", async () => {
    await seedAdult(db, "u-blocked",);
    await insertNsfwUserPreferences(db, "u-blocked", { access_status: "blocked" as never, },);
    const result = await canAccessNsfw(db, makeConfig(), "u-blocked",);
    expect(result,).toEqual({ allowed: false, reason: "blocked", },);
  });

  test("clear user is allowed (no behavior change)", async () => {
    await seedAdult(db, "u-clear",);
    await insertNsfwUserPreferences(db, "u-clear", { access_status: "clear" as never, },);
    const result = await canAccessNsfw(db, makeConfig(), "u-clear",);
    expect(result,).toEqual({ allowed: true, },);
  });

  test("missing prefs row is allowed and not materialized (read-only gate)", async () => {
    await seedAdult(db, "u-norow",);
    const result = await canAccessNsfw(db, makeConfig(), "u-norow",);
    expect(result,).toEqual({ allowed: true, },);
    const row = await db.selectFrom("nsfw_user_preferences",).select("id",).where("user_id", "=", "u-norow",)
      .executeTakeFirst();
    expect(row,).toBeUndefined();
  });

  test("service banUser flows through to denial (writer/reader contract)", async () => {
    await seedAdult(db, "u-svcban",);
    const svc = new NsfwModerationService(db,);
    await svc.banUser("u-svcban", "admin", "probe",);
    const result = await canAccessNsfw(db, makeConfig(), "u-svcban",);
    expect(result,).toEqual({ allowed: false, reason: "banned", },);
  });
});
