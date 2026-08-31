/**
 * Regression tests for checkNsfwEligibility — pre-LLM NSFW gate.
 *
 * Verifies the auto-gen path blocks BEFORE spending tokens on a generation
 * that would never be stored. Companion to content-hooks-nsfw-gate.test.ts
 * (which exercises the post-LLM check inside runContentHooks).
 *
 * Covers the failure mode that motivated extracting this helper: BUG-f0683a8
 * (CRIT) + BUG-5232abe (HIGH) follow-up — `triggerAutoGeneration` previously
 * called callLlm BEFORE runContentHooks, so an underage user would still
 * burn a generation before the post-LLM gate caught it.
 */
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { ContentRating, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { uid, } from "../../utils";
import { checkNsfwEligibility, } from "./content-hooks";

/**
 * @param allowNsfw
 */
function makeConfig(allowNsfw = true,): Config {
  return {
    nsfw: {
      allowNsfw,
      nsfwMinAge: 18,
      defaultNsfwScope: "chat",
      consentRequired: true,
      auditLogging: false,
      useLlmClassifier: false,
    },
  } as unknown as Config;
}

/**
 * @param db
 * @param opts
 * @param opts.birthDate
 * @param opts.ageGateAcceptedAt
 */
async function seedUser(
  db: Kysely<DB>,
  opts: { birthDate?: string | null; ageGateAcceptedAt?: string | null } = {},
): Promise<string> {
  const userId = uid();
  await db
    .insertInto("users",)
    .values({
      id: userId,
      username: `user-${userId.slice(0, 8,)}`,
      display_name: "Test User",
      role: "solo",
      status: "active",
      settings: "{}",
      birth_date: opts.birthDate ?? null,
      age_gate_accepted_at: opts.ageGateAcceptedAt ?? null,
    },)
    .execute();
  return userId;
}

/**
 * @param db
 * @param content_rating
 */
async function createAiActor(
  db: Kysely<DB>,
  content_rating: ContentRating,
): Promise<string> {
  const actorId = uid();
  await db
    .insertInto("actors",)
    .values({
      id: actorId,
      actor_type: "character",
      display_name: "TestActor",
      user_id: null,
      owner_id: null,
      agent_type: "ai",
      settings: "{}",
      format_version: 0,
      visibility: "private",
      import_spec: "{}",
      content_rating,
    },)
    .execute();
  return actorId;
}

describe("checkNsfwEligibility (pre-LLM NSFW gate)", () => {
  let db: Kysely<DB>;
  let adultUserId: string;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    const created = await createTestDb();
    db = created.db;
    adultUserId = await seedUser(db, {
      birthDate: "1990-01-01",
      ageGateAcceptedAt: "2025-01-01T00:00:00Z",
    },);
  },);

  afterAll(async () => {
    await db?.destroy();
  },);

  test("SFW actor: allowed regardless of user age-gate state", async () => {
    const noGateUserId = await seedUser(db, {
      birthDate: null,
      ageGateAcceptedAt: null,
    },);
    const actorId = await createAiActor(db, ContentRating.Sfw,);

    const result = await checkNsfwEligibility({
      database: db,
      config: makeConfig(),
      actorId,
      userId: noGateUserId,
      chatId: "test-chat",
    },);

    expect(result.allowed,).toBe(true,);
    expect(result.reason,).toBeUndefined();
  });

  test("NSFW actor + adult age-gated user: allowed", async () => {
    const actorId = await createAiActor(db, ContentRating.NsfwMild,);

    const result = await checkNsfwEligibility({
      database: db,
      config: makeConfig(),
      actorId,
      userId: adultUserId,
      chatId: "test-chat",
    },);

    expect(result.allowed,).toBe(true,);
  });

  test("NSFW actor + user without age-gate accept: blocked with reason", async () => {
    const noGateUserId = await seedUser(db, {
      birthDate: "1990-01-01",
      ageGateAcceptedAt: null,
    },);
    const actorId = await createAiActor(db, ContentRating.NsfwMild,);

    const result = await checkNsfwEligibility({
      database: db,
      config: makeConfig(),
      actorId,
      userId: noGateUserId,
      chatId: "test-chat",
    },);

    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toBe("age_gate_not_accepted",);
  });

  test("NSFW actor + underage user: blocked with reason", async () => {
    const minorUserId = await seedUser(db, {
      birthDate: "2015-01-01",
      ageGateAcceptedAt: "2025-01-01T00:00:00Z",
    },);
    const actorId = await createAiActor(db, ContentRating.NsfwIntense,);

    const result = await checkNsfwEligibility({
      database: db,
      config: makeConfig(),
      actorId,
      userId: minorUserId,
      chatId: "test-chat",
    },);

    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toMatch(/^underage:/,);
  });

  test("NSFW actor + NSFW globally disabled: blocked with reason", async () => {
    const actorId = await createAiActor(db, ContentRating.NsfwExtreme,);

    const result = await checkNsfwEligibility({
      database: db,
      config: makeConfig(false,),
      actorId,
      userId: adultUserId,
      chatId: "test-chat",
    },);

    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toBe("nsfw_disabled",);
  });

  test("missing actor: defaults to SFW → allowed (defensive)", async () => {
    const result = await checkNsfwEligibility({
      database: db,
      config: makeConfig(),
      actorId: "non-existent",
      userId: adultUserId,
      chatId: "test-chat",
    },);

    expect(result.allowed,).toBe(true,);
  });

  test("all NSFW ratings recognized by isNsfwRating", async () => {
    for (
      const rating of [
        ContentRating.NsfwMild,
        ContentRating.NsfwModerate,
        ContentRating.NsfwIntense,
        ContentRating.NsfwExtreme,
      ]
    ) {
      const actorId = await createAiActor(db, rating,);
      const result = await checkNsfwEligibility({
        database: db,
        config: makeConfig(),
        actorId,
        userId: adultUserId,
        chatId: "test-chat",
      },);
      expect(result.allowed,).toBe(true,);
    }
  });

  test("does NOT throw on null userId — returns auth_required reason", async () => {
    const actorId = await createAiActor(db, ContentRating.NsfwMild,);

    const result = await checkNsfwEligibility({
      database: db,
      config: makeConfig(),
      actorId,
      userId: null as unknown as string,
      chatId: "test-chat",
    },);

    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toBe("auth_required",);
  });
});
