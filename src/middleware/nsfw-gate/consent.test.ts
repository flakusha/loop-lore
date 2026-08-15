/**
 * Integration tests for src/middleware/nsfw-gate/consent.ts — Consent-aware
 * NSFW gating (Chat Lifecycle × consent × rating enforcement).
 *
 * Covers the pure consent-record path and the full DB-backed gate decision
 * (base access → consent check → rating enforcement computation).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema/config";
import { NsfwSection, } from "../../config/sections";
import type { DB, } from "../../db";
import { createLogger, } from "../../logger";
import { NSFWContentRating, } from "../../schemas";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import {
  checkNsfwWithConsent,
  recordNsfwConsent,
} from "./consent";

function makeConfig(overrides: Partial<Config["nsfw"]> = {},): Config {
  // Only nsfw section is read by the gate; other sections are inert placeholders.
  return {
    nsfw: new NsfwSection(overrides,),
  } as unknown as Config;
}

describe("recordNsfwConsent (pure path)", () => {
  test("given grants consent scoped to encounters", () => {
    const state = recordNsfwConsent("chat-1", "user-1", "given",);
    expect(state.consent_given,).toBe(true,);
    expect(state.consent_scope,).toEqual([
      "nsfw_encounter",
      "nsfw_dialogue",
      "nsfw_visual",
    ],);
    expect(state.audit_trail[0],).toMatchObject({
      actor: "user-1",
      action: "given",
      context: { chat_id: "chat-1", },
    },);
  });

  test("revoked clears consent", () => {
    const state = recordNsfwConsent("chat-1", "user-1", "revoked", "no longer ok",);
    expect(state.consent_given,).toBe(false,);
    expect(state.audit_trail[0],).toMatchObject({ action: "revoked", },);
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
    const result = await checkNsfwWithConsent(db, config, "user-1", "chat-1", "actor-1",);
    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toBe("nsfw_disabled",);
  });

  test("denies when no user (auth required)", async () => {
    const config = makeConfig();
    const result = await checkNsfwWithConsent(db, config, null, "chat-1", "actor-1",);
    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toBe("auth_required",);
  });

  test("denies unknown user", async () => {
    const config = makeConfig();
    const result = await checkNsfwWithConsent(db, config, "ghost-user", "chat-1", "actor-1",);
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
    const result = await checkNsfwWithConsent(db, config, "test-nsfw-user", "chat-1", "actor-1",);
    expect(result.allowed,).toBe(false,);
    expect(result.reason,).toBe("age_gate_not_accepted",);
  });

  test("allows with consent + rating enforcement computed from actor rating", async () => {
    await insertUsers(db, "test-nsfw-ok", "Test NSFW OK", {
      id: "test-nsfw-ok" as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);
    await insertActors(db, "actor-nsfw-ok", {
      id: "actor-nsfw-ok" as never,
      content_rating: "nsfw_moderate" as never,
    },);
    const config = makeConfig();
    const result = await checkNsfwWithConsent(db, config, "test-nsfw-ok", "chat-1", "actor-nsfw-ok",);

    expect(result.allowed,).toBe(true,);
    expect(result.consent.consent_given,).toBe(true,);
    expect(result.enforcement.character_rating,).toBe(NSFWContentRating.NSFW_MODERATE,);
    expect(result.enforcement.effective_limit,).toBe(NSFWContentRating.NSFW_MODERATE,);
    expect(result.enforcement.enforcement_point,).toBe("generation",);
  });
});
