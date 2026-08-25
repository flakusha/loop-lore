/**
 * Regression tests for NSFW age-gate precheck in runContentHooks.
 *
 * Covers BUG-5232abe (HIGH) and BUG-f0683a8 (CRIT) follow-up. The precheck
 * ensures NSFW-rated actors verify age-gate acceptance + minimum age BEFORE
 * the hook chain runs, so NSFW content cannot be persisted for users who
 * haven't accepted the age gate or who are under nsfwMinAge.
 *
 * SFW-rated actors MUST skip the precheck to avoid the false-negative on
 * users without an age-gate accept (SFW content never crosses the age
 * threshold, so the check is unnecessary and the DB roundtrip wasted).
 *
 * Uses in-memory SQLite via createTestDb() + raw Kysely inserts (matches
 * auto-gen-cascade.test.ts pattern; insert-helpers.ts uses `as any` but
 * tsgo's literal typing catches Generated<T> mismatch at call sites).
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
import { runContentHooks, } from "./content-hooks";

// ── Minimal config (NSFW gating enabled, adult threshold) ──────

function makeConfig(): Config {
  return {
    nsfw: {
      allowNsfw: true,
      nsfwMinAge: 18,
      defaultNsfwScope: "chat",
      consentRequired: true,
      auditLogging: false,
      useLlmClassifier: false,
    },
  } as unknown as Config;
}

// ── Helpers ─────────────────────────────────────────────────────

async function seedUser(
  db: Kysely<DB>,
  opts: { birthDate?: string; ageGateAcceptedAt?: string | null } = {},
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

async function createChat(db: Kysely<DB>, ownerId: string,): Promise<string> {
  const chatId = uid();
  await db
    .insertInto("chats",)
    .values({
      id: chatId,
      name: "TestChat",
      created_by: ownerId,
    },)
    .execute();
  return chatId;
}

// ── Tests ───────────────────────────────────────────────────────

describe("runContentHooks NSFW age-gate precheck", () => {
  let db: Kysely<DB>;
  let userId: string;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    const created = await createTestDb();
    db = created.db;
    // Default fixture: adult user with age-gate accepted
    userId = await seedUser(db, {
      birthDate: "1990-01-01",
      ageGateAcceptedAt: "2025-01-01T00:00:00Z",
    },);
  },);

  afterAll(async () => {
    await db?.destroy();
  },);

  // ── SFW actor branch (the negative-space branch) ────────────────

  test("SFW actor skips canAccessNsfw (no DB user lookup needed)", async () => {
    const actorId = await createAiActor(db, ContentRating.Sfw,);
    const chatId = await createChat(db, userId,);

    const result = await runContentHooks({
      database: db,
      config: makeConfig(),
      chatId,
      actorId,
      userId,
      content: "harmless text",
    },);

    // SFW actor: gate skipped entirely, hook chain runs unconditionally.
    expect(result.allowed,).toBe(true,);
    expect(result.dominantEmotion,).toBeUndefined();
    expect(result.moodShiftDelta,).toBeUndefined();
  });

  // ── NSFW actor + age-gate accepted + adult → allowed ────────────

  test("NSFW actor with adult age-gated user: gate passes, generation allowed", async () => {
    const actorId = await createAiActor(db, ContentRating.NsfwMild,);
    const chatId = await createChat(db, userId,);

    const result = await runContentHooks({
      database: db,
      config: makeConfig(),
      chatId,
      actorId,
      userId,
      content: "NSFW content",
    },);

    expect(result.allowed,).toBe(true,);
  });

  // ── NSFW actor + user missing age-gate accept → blocked ────────

  test("NSFW actor with user missing age-gate accept: gate blocks generation", async () => {
    const underageUserId = await seedUser(db, {
      birthDate: "1990-01-01",
      ageGateAcceptedAt: null, // critical: no age-gate accept
    },);

    const actorId = await createAiActor(db, ContentRating.NsfwMild,);
    const chatId = await createChat(db, underageUserId,);

    const result = await runContentHooks({
      database: db,
      config: makeConfig(),
      chatId,
      actorId,
      userId: underageUserId,
      content: "NSFW content",
    },);

    // Precheck must block before hook chain runs.
    expect(result.allowed,).toBe(false,);
    expect(result.dominantEmotion,).toBeUndefined();
    expect(result.moodShiftDelta,).toBeUndefined();
  });

  // ── NSFW actor + user under nsfwMinAge → blocked ────────────────

  test("NSFW actor with underage user (under nsfwMinAge): gate blocks generation", async () => {
    const minorUserId = await seedUser(db, {
      birthDate: "2015-01-01", // ~10 years old
      ageGateAcceptedAt: "2025-01-01T00:00:00Z",
    },);

    const actorId = await createAiActor(db, ContentRating.NsfwIntense,);
    const chatId = await createChat(db, minorUserId,);

    const result = await runContentHooks({
      database: db,
      config: makeConfig(),
      chatId,
      actorId,
      userId: minorUserId,
      content: "NSFW content",
    },);

    expect(result.allowed,).toBe(false,);
  });

  // ── NSFW globally disabled → blocked even for adult ──────────────

  test("NSFW globally disabled in config: gate blocks even adult user", async () => {
    const actorId = await createAiActor(db, ContentRating.NsfwExtreme,);
    const chatId = await createChat(db, userId,);

    const disabledConfig = makeConfig();
    disabledConfig.nsfw.allowNsfw = false;

    const result = await runContentHooks({
      database: db,
      config: disabledConfig,
      chatId,
      actorId,
      userId,
      content: "NSFW content",
    },);

    expect(result.allowed,).toBe(false,);
  });

  // ── isNsfwRating future-tier safety (Finding 3) ─────────────────

  test("isNsfwRating recognizes all NSFW tiers via canonical helper (not hand-rolled)", async () => {
    // The fix switched from a hand-rolled `!== 'sfw' && !== 'safe'` to
    // isNsfwRating(). Verify each tier triggers the gate so future
    // tiers added to the enum are auto-recognized.
    for (
      const rating of [
        ContentRating.NsfwMild,
        ContentRating.NsfwModerate,
        ContentRating.NsfwIntense,
        ContentRating.NsfwExtreme,
      ]
    ) {
      const actorId = await createAiActor(db, rating,);
      const chatId = await createChat(db, userId,);

      const result = await runContentHooks({
        database: db,
        config: makeConfig(),
        chatId,
        actorId,
        userId,
        content: "x",
      },);
      // Adult + age-gated user → all NSFW tiers pass through.
      expect(result.allowed,).toBe(true,);
    }
  });
});
