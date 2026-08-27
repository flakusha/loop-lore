/**
 * Integration tests for src/middleware/nsfw-gate/consent.ts — Consent-aware
 * NSFW gating (Chat Lifecycle × consent × rating enforcement).
 *
 * Covers the persisted consent flow (BUG-nsfw-consent-auto-granted): every
 * explicit grant/revoke lands in `nsfw_consent_state`; the gate reads the
 * latest row.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema/config";
import { NsfwSection, } from "../../config/sections";
import type { DB, } from "../../db";
import { createLogger, } from "../../logger";
import { NSFWContentRating, } from "../../schemas";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertChatParticipants, insertNsfwUserPreferences, insertUsers, } from "../../test-utils/insert-helpers";
import { checkChatNsfwAccess, } from "./access";
import {
  checkNsfwWithConsent,
  getLatestConsent,
  hasActiveConsent,
  recordNsfwConsent,
} from "./consent";

function makeConfig(overrides: Partial<Config["nsfw"]> = {},): Config {
  // Only nsfw section is read by the gate; other sections are inert placeholders.
  return {
    nsfw: new NsfwSection(overrides,),
  } as unknown as Config;
}

describe("recordNsfwConsent (persisted)", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("given persists a row and readback returns it", async () => {
    await recordNsfwConsent({
      database: db,
      chatId: "chat-row",
      userId: "user-row",
      action: "given",
      reason: "I am OK with this",
    },);
    const row = await getLatestConsent(db, "chat-row", "user-row",);
    expect(row,).not.toBeNull();
    expect(row!.action,).toBe("given",);
    expect(row!.reason,).toBe("I am OK with this",);
    expect(hasActiveConsent(row,),).toBe(true,);
  });

  test("revocation closes prior given rows and the latest is revoked", async () => {
    await recordNsfwConsent({
      database: db,
      chatId: "chat-revoke",
      userId: "user-revoke",
      action: "given",
    },);
    await recordNsfwConsent({
      database: db,
      chatId: "chat-revoke",
      userId: "user-revoke",
      action: "revoked",
      reason: "changed my mind",
    },);
    const row = await getLatestConsent(db, "chat-revoke", "user-revoke",);
    expect(row?.action,).toBe("revoked",);
    expect(hasActiveConsent(row,),).toBe(false,);
  });

  test("reason longer than 500 chars is trimmed", async () => {
    const huge = "x".repeat(800,);
    await recordNsfwConsent({
      database: db,
      chatId: "chat-trim",
      userId: "user-trim",
      action: "given",
      reason: huge,
    },);
    const row = await getLatestConsent(db, "chat-trim", "user-trim",);
    expect(row?.reason?.length,).toBe(500,);
  });

  test("never-consented user returns null", async () => {
    const row = await getLatestConsent(db, "chat-never", "user-never",);
    expect(row,).toBeNull();
    expect(hasActiveConsent(row,),).toBe(false,);
  });
});

describe("checkNsfwWithConsent (DB-backed)", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("denies when NSFW globally disabled", async () => {
    const config = makeConfig({ allowNsfw: false, },);
    const result = await checkNsfwWithConsent({
      database: db,
      config,
      userId: "user-1",
      chatId: "chat-1",
      actorId: "actor-1",
    },);
    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toBe("nsfw_disabled",);
  });

  test("denies when no user (auth required)", async () => {
    const config = makeConfig();
    const result = await checkNsfwWithConsent({
      database: db,
      config,
      userId: null,
      chatId: "chat-1",
      actorId: "actor-1",
    },);
    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toBe("auth_required",);
  });

  test("denies unknown user", async () => {
    const config = makeConfig();
    const result = await checkNsfwWithConsent({
      database: db,
      config,
      userId: "ghost-user",
      chatId: "chat-1",
      actorId: "actor-1",
    },);
    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toBe("user_not_found",);
  });

  test("denies when age gate not accepted", async () => {
    await insertUsers(db, "test-nsfw-user", "Test NSFW User", {
      id: "test-nsfw-user" as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: null,
    },);
    const config = makeConfig();
    const result = await checkNsfwWithConsent({
      database: db,
      config,
      userId: "test-nsfw-user",
      chatId: "chat-1",
      actorId: "actor-1",
    },);
    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toBe("age_gate_not_accepted",);
  });

  test("consent required + no persisted consent → denied (no auto-grant)", async () => {
    await insertUsers(db, "test-nsfw-noauto", "Test NoAuto", {
      id: "test-nsfw-noauto" as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);
    await insertActors(db, "actor-nsfw-noauto", {
      id: "actor-nsfw-noauto" as never,
      content_rating: "nsfw_moderate" as never,
    },);
    const config = makeConfig({ consentRequired: true, },);
    const result = await checkNsfwWithConsent({
      database: db,
      config,
      userId: "test-nsfw-noauto",
      chatId: "chat-noauto",
      actorId: "actor-nsfw-noauto",
    },);
    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toBe("consent_required",);
  });

  test("consent required + explicit grant → allowed with real enforcement", async () => {
    const userId = "test-nsfw-grant";
    await insertUsers(db, userId, "Test Grant", {
      id: userId as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);
    const actorId = "actor-nsfw-grant";
    await insertActors(db, actorId, {
      id: actorId as never,
      content_rating: "nsfw_moderate" as never,
    },);
    const config = makeConfig({ consentRequired: true, },);
    // Persist an explicit grant
    await recordNsfwConsent({
      database: db,
      chatId: "chat-grant",
      userId,
      action: "given",
    },);
    const result = await checkNsfwWithConsent({
      database: db,
      config,
      userId,
      chatId: "chat-grant",
      actorId,
    },);
    expect(result.allowed,).toBe(true,);
    // Real enforcement uses user's persisted max_rating (DB default NSFW_MILD),
    // not the legacy hard-coded EXTREME — effective_limit is min(MILD, MODERATE).
    expect(result.enforcement.character_rating,).toBe(NSFWContentRating.NSFW_MODERATE,);
    expect(result.enforcement.user_preference,).toBe(NSFWContentRating.NSFW_MILD,);
    expect(result.enforcement.effective_limit,).toBe(NSFWContentRating.NSFW_MILD,);
  });

  test("consent required + revoked after grant → denied (consent_revoked)", async () => {
    const userId = "test-nsfw-revoked";
    await insertUsers(db, userId, "Test Revoked", {
      id: userId as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);
    const actorId = "actor-nsfw-revoked";
    await insertActors(db, actorId, {
      id: actorId as never,
      content_rating: "nsfw_moderate" as never,
    },);
    await recordNsfwConsent({
      database: db,
      chatId: "chat-revoked-flow",
      userId,
      action: "given",
    },);
    await recordNsfwConsent({
      database: db,
      chatId: "chat-revoked-flow",
      userId,
      action: "revoked",
    },);
    const config = makeConfig({ consentRequired: true, },);
    const result = await checkNsfwWithConsent({
      database: db,
      config,
      userId,
      chatId: "chat-revoked-flow",
      actorId,
    },);
    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toBe("consent_revoked",);
  });

  test("consent not required → allowed without persisted consent", async () => {
    const userId = "test-nsfw-no-consent-cfg";
    await insertUsers(db, userId, "Test NoCfg", {
      id: userId as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);
    const actorId = "actor-nsfw-no-consent-cfg";
    await insertActors(db, actorId, {
      id: actorId as never,
      content_rating: "nsfw_moderate" as never,
    },);
    const config = makeConfig({ consentRequired: false, },);
    const result = await checkNsfwWithConsent({
      database: db,
      config,
      userId,
      chatId: "chat-no-consent-cfg",
      actorId,
    },);
    expect(result.allowed,).toBe(true,);
  });

  test("weakest link: participant max_rating lowers user_preference ceiling", async () => {
    const userA = "u-weakest-a";
    const userB = "u-weakest-b";
    await insertUsers(db, userA, "Weakest A", {
      id: userA as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);
    await insertUsers(db, userB, "Weakest B", {
      id: userB as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);
    await insertNsfwUserPreferences(db, userA, { max_rating: "nsfw_extreme" as never, },);
    await insertNsfwUserPreferences(db, userB, { max_rating: "nsfw_mild" as never, },);
    await insertChats(db, "weakest", userA, { id: "chat-weakest" as never, },);
    const actorA = "actor-weakest-a";
    const actorB = "actor-weakest-b";
    await insertActors(db, actorA, {
      id: actorA as never,
      user_id: userA,
      content_rating: "nsfw_extreme" as never,
    },);
    await insertActors(db, actorB, {
      id: actorB as never,
      user_id: userB,
    },);
    await insertChatParticipants(db, "chat-weakest", actorA,);
    await insertChatParticipants(db, "chat-weakest", actorB,);

    const config = makeConfig({ consentRequired: false, },);
    const result = await checkNsfwWithConsent({
      database: db,
      config,
      userId: userA,
      chatId: "chat-weakest",
      actorId: actorA,
    },);
    expect(result.allowed,).toBe(true,);
    // Participant B's NSFW_MILD ceiling wins over A's EXTREME preference.
    expect(result.enforcement.user_preference,).toBe(NSFWContentRating.NSFW_MILD,);
    expect(result.enforcement.effective_limit,).toBe(NSFWContentRating.NSFW_MILD,);
  });

  test("weakest link: participant without age gate blocks chat access", async () => {
    const userC = "u-gate-ok";
    const userD = "u-gate-no";
    await insertUsers(db, userC, "Gate OK", {
      id: userC as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);
    await insertUsers(db, userD, "Gate No", {
      id: userD as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: null,
    },);
    await insertChats(db, "gate-link", userC, { id: "chat-gate-link" as never, },);
    const actorC = "actor-gate-ok";
    const actorD = "actor-gate-no";
    await insertActors(db, actorC, { id: actorC as never, user_id: userC, },);
    await insertActors(db, actorD, { id: actorD as never, user_id: userD, },);
    await insertChatParticipants(db, "chat-gate-link", actorC,);
    await insertChatParticipants(db, "chat-gate-link", actorD,);

    const config = makeConfig();
    const result = await checkChatNsfwAccess(db, config, userC, "chat-gate-link",);
    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toBe("participant_blocked:age_gate_not_accepted",);
  });
});
