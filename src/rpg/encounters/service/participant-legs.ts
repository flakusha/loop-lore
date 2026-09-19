// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { MoodService, } from "../../../characters/services/mood-service";
import type { DB, } from "../../../db/schema";
import type { getLogger, } from "../../../logger";
import { jsonStringifyOr, } from "../../../utils";
import { IntimacyService, } from "../../intimacy/service";
import { logXp, } from "../../service/xp";
import type { EncounterOutcome, NsfwEncounter, } from "./types";

/**
 * First participant that is not `self` (pair leg needs a target).
 * @param participants
 * @param self
 */
export function firstOtherParticipant(participants: string[], self: string,): string | null {
  for (const id of participants) { if (id !== self) { return id; } }
  return null;
}

/** Logger + service handles threaded into the per-leg helpers. */
export interface LegContext {
  intimacy: IntimacyService;
  mood: ReturnType<typeof MoodService>;
  log: ReturnType<typeof getLogger>;
  encounter: NsfwEncounter;
  outcome: EncounterOutcome;
  intimacyDelta: number;
  participant: string;
}

/**
 * Intimacy score leg: pair delta via the canonical action path.
 * @param db
 * @param ctx
 */
export async function applyIntimacyLeg(db: Kysely<DB>, ctx: LegContext,): Promise<void> {
  const { intimacy, log, encounter, outcome, intimacyDelta, participant, } = ctx;
  const partner = firstOtherParticipant(encounter.participants, participant,);
  try {
    if (partner && intimacyDelta !== 0) {
      await intimacy.applyAction({
        database: db,
        actorId: participant,
        targetActorId: partner,
        worldId: encounter.worldId,
        action: {
          id: `encounter:${encounter.id}:${outcome.type}`,
          name: `Encounter ${outcome.type}`,
          type: "intimate",
          delta: intimacyDelta,
          minIntimacy: 0,
          requiresConsent: false,
        },
      },);
    }
  } catch (cause) {
    log.warn(`Intimacy fan-out skipped for ${participant}:`, {
      error: cause instanceof Error ? cause.message : String(cause,),
    },);
  }
}

/**
 * Mood event leg: one source-tagged `encounter.completed` event.
 * @param ctx
 */
export async function applyMoodLeg(ctx: LegContext,): Promise<void> {
  const { mood, log, encounter, outcome, participant, } = ctx;
  try {
    await mood.logEvent({
      actorId: participant,
      worldId: encounter.worldId ?? undefined,
      eventType: "encounter.completed",
      happinessDelta: outcome.effects.moodChange,
      source: "encounter",
      sourceId: `${encounter.id}:${outcome.type}`,
    },);
  } catch (cause) {
    log.warn(`Mood fan-out skipped for ${participant}:`, {
      error: cause instanceof Error ? cause.message : String(cause,),
    },);
  }
}

/**
 * Shared XP ledger leg (TASK-040): satisfaction bonus mirrors as XP.
 * @param db
 * @param ctx
 */
export async function applyXpLeg(db: Kysely<DB>, ctx: LegContext,): Promise<void> {
  const { log, encounter, outcome, participant, } = ctx;
  try {
    if (outcome.effects.satisfactionBonus > 0) {
      await logXp({ database: db, }, {
        actorId: participant,
        amount: outcome.effects.satisfactionBonus,
        source: "nsfw_encounter",
        description: `Encounter ${outcome.type} (${encounter.encounterType})`,
      },);
    }
  } catch (cause) {
    log.warn(`XP fan-out skipped for ${participant}:`, {
      error: cause instanceof Error ? cause.message : String(cause,),
    },);
  }
}

/**
 * Memory leg (TASK-041/Open Q8): one `actor_memories` row when flagged,
 * so the long-term memory pipeline sees the encounter.
 *
 * storeMemories binds source_chat_id → chats.id (FK); the encounter
 * world is not a chat, so write the memory row directly with a world
 * binding — no chat FK, same long-term pipeline visibility.
 * ExtractionKind is a closed union without an encounter member, so the
 * row uses the manual kind (authored by a system, not the LLM).
 * @param db
 * @param ctx
 */
export async function applyMemoryLeg(db: Kysely<DB>, ctx: LegContext,): Promise<void> {
  const { log, encounter, outcome, participant, } = ctx;
  try {
    if (outcome.effects.memoryCreated) {
      const partner = firstOtherParticipant(encounter.participants, participant,);
      const now = new Date().toISOString();
      await db
        .insertInto("actor_memories",)
        .values({
          id: crypto.randomUUID(),
          actor_id: participant,
          content: `Encounter ${outcome.type} (${encounter.encounterType}) with ${partner ?? "self"}`,
          memory_type: "episodic",
          confidence: 0.8,
          importance: 0.6,
          keywords: jsonStringifyOr(["encounter", outcome.type, encounter.encounterType,],),
          world_id: encounter.worldId,
          scope: "character",
          privacy: "shared",
          review_status: "committed",
          extraction_kind: "manual",
          created_at: now,
          updated_at: now,
        },)
        .execute();
    }
  } catch (cause) {
    log.warn(`Memory fan-out skipped for ${participant}:`, {
      error: cause instanceof Error ? cause.message : String(cause,),
    },);
  }
}

/**
 * Trauma leg (TASK-044): severity derives from the outcome shape via
 * `severityFromOutcome` — never from LLM judgment. Satisfaction /
 * bonding / discovery write nothing; dissatisfaction / injury write one
 * shared `trauma` row per participant (recovery = row expiry, driven by
 * the shared sweep). Best-effort like every other leg.
 * @param db
 * @param ctx
 */
export async function applyTraumaLeg(db: Kysely<DB>, ctx: LegContext,): Promise<void> {
  const { log, encounter, outcome, participant, } = ctx;
  try {
    const { TraumaService, } = await import("../../trauma");
    await new TraumaService(db,).applyFromOutcome(
      participant,
      { type: outcome.type, effects: { moodChange: outcome.effects.moodChange, } as EncounterOutcome["effects"], },
      false,
      encounter.id,
    );
  } catch (cause) {
    log.warn(`Trauma fan-out skipped for ${participant}:`, {
      error: cause instanceof Error ? cause.message : String(cause,),
    },);
  }
}

/**
 * Pregnancy leg (TASK-038): event-driven conception roll per outcome —
 * never polled. The carrier is each participant in turn (sire = first
 * other participant); species resolve from heat-cycle rows inside the
 * service. Best-effort like every other leg.
 * @param db
 * @param ctx
 */
export async function applyPregnancyLeg(db: Kysely<DB>, ctx: LegContext,): Promise<void> {
  const { log, encounter, participant, } = ctx;
  try {
    const { ReproductionService, } = await import("../../reproduction");
    const sire = firstOtherParticipant(encounter.participants, participant,) ?? participant;
    await new ReproductionService(db,).rollPregnancy(
      participant,
      sire,
      { id: encounter.id, worldId: encounter.worldId, },
    );
  } catch (cause) {
    log.warn(`Pregnancy fan-out skipped for ${participant}:`, {
      error: cause instanceof Error ? cause.message : String(cause,),
    },);
  }
}

/**
 * All per-participant legs for one outcome: intimacy, mood, XP, trauma,
 * pregnancy, memory.
 * @param db
 * @param ctx
 */
export async function applyParticipantLegs(db: Kysely<DB>, ctx: LegContext,): Promise<void> {
  await applyIntimacyLeg(db, ctx,);
  await applyMoodLeg(ctx,);
  await applyXpLeg(db, ctx,);
  await applyTraumaLeg(db, ctx,);
  await applyPregnancyLeg(db, ctx,);
  await applyMemoryLeg(db, ctx,);
}
