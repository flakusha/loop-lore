// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Capability gate tests — {@link assertNsfwCapability} composes the
 * middleware request gate, consent-state invariants, the rating limit,
 * and the intimacy threshold into a throwing verdict.
 *
 * Seeding mirrors src/middleware/nsfw-gate/consent.test.ts (same
 * middleware stack under test).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema/config";
import { NsfwSection, } from "../config/sections";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { recordNsfwConsent, } from "../middleware/nsfw-gate/consent-ledger";
import { NSFWContentRating, } from "../schemas";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertCharacterIntimacy,
  insertChatParticipants,
  insertChats,
  insertNsfwUserPreferences,
  insertUsers,
} from "../test-utils/insert-helpers";
import { assertNsfwCapability, CapabilityBlockedError, } from "./capability-gate";

/** */
function makeConfig(overrides: Partial<Config["nsfw"]> = {},): Config {
  // Only the nsfw section is read by the gate; other sections are inert.
  return {
    nsfw: new NsfwSection(overrides,),
  } as unknown as Config;
}

/** Seed args for one gate invocation over a seeded actor pair. */
interface PairIds {
  user: string;
  chat: string;
  actor: string;
  target: string;
}

/**
 * Seed an age-gated user, a same-user actor pair in one chat, optional
 * consent ledger rows, and return the gate config.
 * @param db - Test database.
 * @param ids - Row ids.
 * @param opts - Scenario knobs.
 * @param opts.actorRating - Actor content_rating. Default "sfw".
 * @param opts.userMaxRating - Requesting user's persisted max_rating (prefs row). Default none (MILD fail-closed).
 * @param opts.consent - Consent ledger action. Default "none".
 * @param opts.consentRequired - `nsfw.consentRequired` config. Default true.
 */
async function seedGatePair(
  db: Kysely<DB>,
  ids: PairIds,
  opts: {
    actorRating?: string;
    userMaxRating?: string;
    consent?: "given" | "revoked" | "none";
    consentRequired?: boolean;
  } = {},
): Promise<Config> {
  await insertUsers(db, ids.user, "Gate User", {
    id: ids.user as never,
    birth_date: "1990-01-01",
    age_gate_accepted_at: "2026-01-01T00:00:00Z",
  },);
  await insertChats(db, "gate", ids.user, { id: ids.chat as never, },);
  await insertActors(db, ids.actor, {
    id: ids.actor as never,
    user_id: ids.user,
    content_rating: (opts.actorRating ?? "sfw") as never,
  },);
  await insertActors(db, ids.target, {
    id: ids.target as never,
    user_id: ids.user,
  },);
  await insertChatParticipants(db, ids.chat, ids.actor,);
  await insertChatParticipants(db, ids.chat, ids.target,);
  if (opts.userMaxRating !== undefined) {
    await insertNsfwUserPreferences(db, ids.user, {
      max_rating: opts.userMaxRating as never,
    },);
  }
  if (opts.consent === "given" || opts.consent === "revoked") {
    await recordNsfwConsent({
      database: db,
      chatId: ids.chat,
      userId: ids.user,
      action: "given",
    },);
  }
  if (opts.consent === "revoked") {
    await recordNsfwConsent({
      database: db,
      chatId: ids.chat,
      userId: ids.user,
      action: "revoked",
    },);
  }
  return makeConfig({ consentRequired: opts.consentRequired ?? true, },);
}

/** Invoke the gate over a seeded pair. */
function gate(db: Kysely<DB>, config: Config, ids: PairIds, extra: {
  contentRating?: NSFWContentRating;
  ratingLimits?: NSFWContentRating[];
  consentAction?: string;
} = {},) {
  return assertNsfwCapability({
    database: db,
    config,
    userId: ids.user,
    chatId: ids.chat,
    actorId: ids.actor,
    targetActorId: ids.target,
    ...extra,
  },);
}

describe("assertNsfwCapability", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("blocks with access_denied when NSFW is globally disabled", async () => {
    const ids = { user: "u-gate-off", chat: "c-gate-off", actor: "a-gate-off", target: "t-gate-off", };
    const config = await seedGatePair(db, ids,);
    const disabled = makeConfig({ allowNsfw: false, },);
    await expect(gate(db, disabled, ids,),).rejects.toThrow(CapabilityBlockedError,);
    await expect(gate(db, disabled, ids,),).rejects.toMatchObject({
      reason: "access_denied",
    },);
    expect(config,).toBeDefined();
  });

  test("blocks with access_denied and revocation passthrough after consent revoke", async () => {
    const ids = {
      user: "u-gate-revoked",
      chat: "c-gate-revoked",
      actor: "a-gate-revoked",
      target: "t-gate-revoked",
    };
    const config = await seedGatePair(db, ids, { consent: "revoked", },);
    await expect(gate(db, config, ids,),).rejects.toThrow(CapabilityBlockedError,);
    await expect(gate(db, config, ids,),).rejects.toMatchObject({
      reason: "access_denied",
    },);
  });

  test("blocks with action_not_consented for an action outside the consent scope", async () => {
    const ids = {
      user: "u-gate-scope",
      chat: "c-gate-scope",
      actor: "a-gate-scope",
      target: "t-gate-scope",
    };
    const config = await seedGatePair(db, ids, { consent: "given", },);
    await expect(gate(db, config, ids, { consentAction: "custom_ritual", },),)
      .rejects.toMatchObject({ reason: "action_not_consented", },);
  });

  test("blocks with rating_blocked when the actor rating exceeds the effective limit", async () => {
    const ids = {
      user: "u-gate-rating",
      chat: "c-gate-rating",
      actor: "a-gate-rating",
      target: "t-gate-rating",
    };
    // Actor MODERATE vs user default preference MILD → effective limit MILD.
    const config = await seedGatePair(db, ids, {
      actorRating: "nsfw_moderate",
      consent: "given",
    },);
    await expect(gate(db, config, ids,),).rejects.toThrow(CapabilityBlockedError,);
    await expect(gate(db, config, ids,),).rejects.toMatchObject({
      reason: "rating_blocked",
    },);
  });

  test("blocks with intimacy_insufficient when the pair has no intimacy history", async () => {
    const ids = {
      user: "u-gate-intimacy",
      chat: "c-gate-intimacy",
      actor: "a-gate-intimacy",
      target: "t-gate-intimacy",
    };
    const config = await seedGatePair(db, ids, { consentRequired: false, },);
    await expect(gate(db, config, ids,),).rejects.toThrow(CapabilityBlockedError,);
    await expect(gate(db, config, ids,),).rejects.toMatchObject({
      reason: "intimacy_insufficient",
    },);
  });

  test("grants when consent, rating, and intimacy all pass — and returns verdicts", async () => {
    const ids = {
      user: "u-gate-ok",
      chat: "c-gate-ok",
      actor: "a-gate-ok",
      target: "t-gate-ok",
    };
    const config = await seedGatePair(db, ids, { consentRequired: false, },);
    await insertCharacterIntimacy(
      db,
      ids.actor,
      ids.target,
      "2026-01-01T00:00:00Z",
      "2026-01-01T00:00:00Z",
      { score: 45, },
    );
    const grant = await gate(db, config, ids,);
    expect(grant.intimacy,).toEqual({ sufficient: true, score: 45, threshold: 40, },);
    expect(grant.enforcement.character_rating,).toBe(NSFWContentRating.SFW,);
    // With consentRequired=false the middleware returns the empty consent
    // state (models consent as always-required, not given) and still allows.
    expect(grant.consent.consent_required,).toBe(true,);
    expect(grant.consent.consent_given,).toBe(false,);
  });

  test("ratingLimits tightens the effective limit below the actor rating", async () => {
    const ids = {
      user: "u-gate-tighten",
      chat: "c-gate-tighten",
      actor: "a-gate-tighten",
      target: "t-gate-tighten",
    };
    // INTENSE actor + EXTREME user preference clears the default gate…
    const config = await seedGatePair(db, ids, {
      actorRating: "nsfw_intense",
      userMaxRating: "nsfw_extreme",
      consentRequired: false,
    },);
    await insertCharacterIntimacy(
      db,
      ids.actor,
      ids.target,
      "2026-01-01T00:00:00Z",
      "2026-01-01T00:00:00Z",
      { score: 60, },
    );
    await expect(gate(db, config, ids,),).resolves.toBeDefined();
    // …but an explicit MILD ceiling blocks it.
    await expect(gate(db, config, ids, {
      ratingLimits: [NSFWContentRating.NSFW_MILD,],
    },),).rejects.toMatchObject({ reason: "rating_blocked", },);
  });

  test("explicit contentRating is checked against the limit, not the actor rating", async () => {
    const ids = {
      user: "u-gate-content",
      chat: "c-gate-content",
      actor: "a-gate-content",
      target: "t-gate-content",
    };
    const config = await seedGatePair(db, ids, { consentRequired: false, },);
    await insertCharacterIntimacy(
      db,
      ids.actor,
      ids.target,
      "2026-01-01T00:00:00Z",
      "2026-01-01T00:00:00Z",
      { score: 50, },
    );
    // SFW actor passes by default, but the content about to be produced is EXTREME.
    await expect(gate(db, config, ids,),).resolves.toBeDefined();
    await expect(gate(db, config, ids, {
      contentRating: NSFWContentRating.NSFW_EXTREME,
    },),).rejects.toMatchObject({ reason: "rating_blocked", },);
  });
});
