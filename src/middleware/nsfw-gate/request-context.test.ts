// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the unified request-context pipeline: stage ordering, fail-fast
 * verdicts, and the server-side skip allowlist (settings provisioning and
 * headers-only subsets).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema/config";
import { NsfwSection, } from "../../config/sections";
import type { DB, } from "../../db";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertNsfwUserPreferences,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { recordNsfwConsent, } from "./consent-ledger";
import { resolveRequestContext, } from "./request-context";

/**
 * @param overrides
 */
function makeConfig(overrides: Partial<Config["nsfw"]> = {},): Config {
  return {
    nsfw: new NsfwSection(overrides,),
  } as unknown as Config;
}

/** Adult age-gated user. */
async function seedAdult(db: Kysely<DB>, id: string,): Promise<void> {
  await insertUsers(db, id, `User ${id}`, {
    id: id as never,
    birth_date: "1990-01-01",
    age_gate_accepted_at: "2026-01-01T00:00:00Z",
  },);
}

describe("resolveRequestContext", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("anonymous caller short-circuits to auth_required", async () => {
    const result = await resolveRequestContext({
      database: db,
      config: makeConfig(),
      userId: null,
      chatId: "chat-x",
      actorId: "actor-x",
    },);
    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toBe("auth_required",);
    expect(result.consentGranted,).toBe(false,);
  });

  test("full gate allows adult with consent grant + enforcement present", async () => {
    await seedAdult(db, "u-ctx-ok",);
    await insertActors(db, "actor-ctx-ok", { id: "actor-ctx-ok" as never, },);
    await recordNsfwConsent({ database: db, chatId: "chat-ctx-ok", userId: "u-ctx-ok", action: "given", },);
    const result = await resolveRequestContext({
      database: db,
      config: makeConfig({ consentRequired: true, },),
      userId: "u-ctx-ok",
      chatId: "chat-ctx-ok",
      actorId: "actor-ctx-ok",
      buildEnforcement: async () => ({} as never),
    },);
    expect(result.allowed,).toBe(true,);
    expect(result.consent,).toBe("granted",);
    expect(result.consentGranted,).toBe(true,);
    expect(result.enforcement,).toBeDefined();
  });

  test("consent denial carries revoked/required state without grant flag", async () => {
    await seedAdult(db, "u-ctx-noconsent",);
    await insertActors(db, "actor-ctx-nc", { id: "actor-ctx-nc" as never, },);
    const result = await resolveRequestContext({
      database: db,
      config: makeConfig({ consentRequired: true, },),
      userId: "u-ctx-noconsent",
      chatId: "chat-ctx-nc",
      actorId: "actor-ctx-nc",
    },);
    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toBe("consent_required",);
    expect(result.consent,).toBe("required",);
    expect(result.consentGranted,).toBe(false,);
  });

  test("skip.consent allows settings-provisioning subset without a grant", async () => {
    await seedAdult(db, "u-ctx-skipconsent",);
    const result = await resolveRequestContext({
      database: db,
      config: makeConfig({ consentRequired: true, },),
      userId: "u-ctx-skipconsent",
      chatId: "chat-ctx-sc",
      actorId: "actor-ctx-sc",
      skip: { consent: true, },
    },);
    expect(result.allowed,).toBe(true,);
    expect(result.consent,).toBe("not_required",);
    expect(result.consentGranted,).toBe(false,);
  });

  test("skip.participants ignores a blocked co-participant", async () => {
    await seedAdult(db, "u-ctx-req",);
    await seedAdult(db, "u-ctx-blocked",);
    await insertNsfwUserPreferences(db, "u-ctx-blocked", { access_status: "blocked" as never, },);
    await insertChats(db, "ctx chat", "u-ctx-req", { id: "chat-ctx-part" as never, },);
    await insertActors(db, "actor-ctx-req", { id: "actor-ctx-req" as never, user_id: "u-ctx-req", },);
    await insertActors(db, "actor-ctx-blocked", { id: "actor-ctx-blocked" as never, user_id: "u-ctx-blocked", },);
    await insertChatParticipants(db, "chat-ctx-part", "actor-ctx-req",);
    await insertChatParticipants(db, "chat-ctx-part", "actor-ctx-blocked",);

    const full = await resolveRequestContext({
      database: db,
      config: makeConfig({ consentRequired: false, },),
      userId: "u-ctx-req",
      chatId: "chat-ctx-part",
      actorId: "actor-ctx-req",
    },);
    expect(full.allowed,).toBe(false,);
    expect(full.reason,).toBe("participant_blocked:blocked",);
    expect(full.participantDenial?.userId,).toBe("u-ctx-blocked",);

    const skipped = await resolveRequestContext({
      database: db,
      config: makeConfig({ consentRequired: false, },),
      userId: "u-ctx-req",
      chatId: "chat-ctx-part",
      actorId: "actor-ctx-req",
      skip: { participants: true, },
    },);
    expect(skipped.allowed,).toBe(true,);
    expect(skipped.participantDenial,).toBeUndefined();
  });

  test("skip.moderation reads through a ban for provisioning", async () => {
    await seedAdult(db, "u-ctx-banned",);
    await insertNsfwUserPreferences(db, "u-ctx-banned", { access_status: "banned" as never, },);
    const denied = await resolveRequestContext({
      database: db,
      config: makeConfig({ consentRequired: false, },),
      userId: "u-ctx-banned",
      chatId: "chat-ctx-ban",
      actorId: "actor-ctx-ban",
    },);
    expect(denied.allowed,).toBe(false,);
    expect(denied.reason,).toBe("banned",);

    const provisioned = await resolveRequestContext({
      database: db,
      config: makeConfig({ consentRequired: false, },),
      userId: "u-ctx-banned",
      chatId: "chat-ctx-ban",
      actorId: "actor-ctx-ban",
      skip: { moderation: true, },
    },);
    expect(provisioned.allowed,).toBe(true,);
    expect(provisioned.base.allowed,).toBe(true,);
  });

  test("skip.enforcement omits the ceiling object", async () => {
    await seedAdult(db, "u-ctx-noenf",);
    const result = await resolveRequestContext({
      database: db,
      config: makeConfig({ consentRequired: false, },),
      userId: "u-ctx-noenf",
      chatId: "chat-ctx-noenf",
      actorId: "actor-ctx-noenf",
      skip: { enforcement: true, },
      buildEnforcement: async () => {
        throw new Error("must not build",);
      },
    },);
    expect(result.allowed,).toBe(true,);
    expect(result.enforcement,).toBeUndefined();
  });
});
