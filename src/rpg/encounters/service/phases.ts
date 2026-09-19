// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { IntimacyService, } from "../../intimacy/service";
import { LocationNsfwService, } from "../../location-nsfw/service";
import { MoodService, } from "../../../characters/services/mood-service";
import { calculateEncounterReputationChange, } from "../../../nsfw/social-integration";
import { logXp, } from "../../service/xp";
import { jsonStringifyOr, } from "../../../utils";
import { getEncounter, } from "./crud";
import type { AdvancePhaseResult, EncounterOutcome, NsfwEncounter, } from "./types";

/**
 * Roll for outcomes based on probability.
 * @param outcomes
 */
function rollOutcomes(outcomes: EncounterOutcome[],): EncounterOutcome[] {
  const triggered: EncounterOutcome[] = [];
  for (const outcome of outcomes) {
    if (Math.random() < outcome.probability) {
      triggered.push(outcome,);
    }
  }
  return triggered;
}

/**
 * Apply outcome effects.
 *
 * Fan-out (TASK-036/037/038/040/041/042): each triggered outcome's deltas
 * land in the canonical stores — intimacy pairs, mood events, the
 * shared XP ledger, reputation deltas, fantasy exploration counts,
 * pregnancy rolls, memory rows. Every leg is best-effort (try/catch) so a missing
 * auxiliary row never fails the encounter completion itself. Outcomes
 * with `memoryCreated` persist one `actor_memories` row per participant
 * so the long-term memory pipeline (Open Q8) sees the encounter.
 * @param db
 * @param encounter
 * @param outcomes
 */
async function applyOutcomes(
  db: Kysely<DB>,
  encounter: NsfwEncounter,
  outcomes: EncounterOutcome[],
): Promise<void> {
  const log = getLogger().child({ module: "encounters", },);
  if (outcomes.length === 0) { return; }
  const intimacy = new IntimacyService(db,);
  const mood = MoodService(db,);
  const locations = new LocationNsfwService(db,);
  for (const outcome of outcomes) {
    log.info(
      `Encounter ${encounter.id} outcome: ${outcome.type} (intimacy ${
        outcome.effects.intimacyChange > 0 ? "+" : ""
      }${outcome.effects.intimacyChange})`,
    );
    const intimacyDelta = outcome.effects.intimacyChange + await resolveAtmosphereBonus(db, locations, log, encounter.id,);
    for (const participant of encounter.participants) {
      await applyParticipantLegs(db, { intimacy, mood, log, encounter, outcome, intimacyDelta, participant, },);
    }
    await applyReputationLeg(db, log, encounter, outcome,);
  }
}

/**
 * Locate the encounter's venue from its status_effect row.
 *
 * Written by `createEncounter` when a locationId is supplied
 * (category "venue", source "encounter"). Returns null when no
 * venue was attached — the atmosphere bonus then stays zero.
 * @param db
 * @param encounterId
 */
async function findEncounterLocation(
  db: Kysely<DB>,
  encounterId: string,
): Promise<string | null> {
  const row = await db
    .selectFrom("status_effect",)
    .where("source", "=", "encounter",)
    .where("source_id", "=", encounterId,)
    .where("effect_id", "=", "encounter_venue",)
    .select("meta",)
    .executeTakeFirst();
  if (!row?.meta) { return null; }
  try {
    const parsed = JSON.parse(row.meta,) as { location_id?: unknown };
    return typeof parsed.location_id === "string" ? parsed.location_id : null;
  } catch {
    return null;
  }
}

/** Logger + service handles threaded into the per-leg helpers. */
interface LegContext {
  intimacy: IntimacyService;
  mood: ReturnType<typeof MoodService>;
  log: ReturnType<typeof getLogger>;
  encounter: NsfwEncounter;
  outcome: EncounterOutcome;
  intimacyDelta: number;
  participant: string;
}

/**
 * Location atmosphere bonus (TASK-043): a romantic venue (+2 at
 * romantic ≥ 70) amplifies the intimacy delta; a dangerous one
 * (−2 at dangerous ≥ 70) tempers it. Read-only consult — no writes
 * to the location store from the encounter path. Failures → 0.
 * @param db
 * @param locations
 * @param log
 * @param encounterId
 */
async function resolveAtmosphereBonus(
  db: Kysely<DB>,
  locations: LocationNsfwService,
  log: ReturnType<typeof getLogger>,
  encounterId: string,
): Promise<number> {
  try {
    const locationId = await findEncounterLocation(db, encounterId,);
    if (!locationId) { return 0; }
    const atmosphere = await locations.resolveAtmosphere(locationId,);
    if (atmosphere.romantic >= 70) { return 2; }
    if (atmosphere.dangerous >= 70) { return -2; }
    return 0;
  } catch (cause) {
    log.warn(`Atmosphere consult skipped for ${encounterId}:`, { error: cause instanceof Error ? cause.message : String(cause), },);
    return 0;
  }
}

/**
 * Intimacy score leg: pair delta via the canonical action path.
 * @param db
 * @param ctx
 */
async function applyIntimacyLeg(db: Kysely<DB>, ctx: LegContext,): Promise<void> {
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
    log.warn(`Intimacy fan-out skipped for ${participant}:`, { error: cause instanceof Error ? cause.message : String(cause), },);
  }
}

/**
 * Mood event leg: one source-tagged `encounter.completed` event.
 * @param ctx
 */
async function applyMoodLeg(ctx: LegContext,): Promise<void> {
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
    log.warn(`Mood fan-out skipped for ${participant}:`, { error: cause instanceof Error ? cause.message : String(cause), },);
  }
}

/**
 * Shared XP ledger leg (TASK-040): satisfaction bonus mirrors as XP.
 * @param db
 * @param ctx
 */
async function applyXpLeg(db: Kysely<DB>, ctx: LegContext,): Promise<void> {
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
    log.warn(`XP fan-out skipped for ${participant}:`, { error: cause instanceof Error ? cause.message : String(cause), },);
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
async function applyMemoryLeg(db: Kysely<DB>, ctx: LegContext,): Promise<void> {
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
          keywords: jsonStringifyOr(["encounter", outcome.type, encounter.encounterType,]),
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
    log.warn(`Memory fan-out skipped for ${participant}:`, { error: cause instanceof Error ? cause.message : String(cause), },);
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
async function applyTraumaLeg(db: Kysely<DB>, ctx: LegContext,): Promise<void> {
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
    log.warn(`Trauma fan-out skipped for ${participant}:`, { error: cause instanceof Error ? cause.message : String(cause), },);
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
async function applyPregnancyLeg(db: Kysely<DB>, ctx: LegContext,): Promise<void> {
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
    log.warn(`Pregnancy fan-out skipped for ${participant}:`, { error: cause instanceof Error ? cause.message : String(cause), },);
  }
}

/**
 * All per-participant legs for one outcome: intimacy, mood, XP, trauma,
 * pregnancy, memory.
 * @param db
 * @param ctx
 */
async function applyParticipantLegs(db: Kysely<DB>, ctx: LegContext,): Promise<void> {
  await applyIntimacyLeg(db, ctx,);
  await applyMoodLeg(ctx,);
  await applyXpLeg(db, ctx,);
  await applyTraumaLeg(db, ctx,);
  await applyPregnancyLeg(db, ctx,);
  await applyMemoryLeg(db, ctx,);
}

/**
 * Reputation leg (TASK-042): the canonical calculator derives the delta
 * from the encounter shape; the delta persists as a status_effect row
 * (category "reputation", no expiry) — the shared ReputationScore
 * value object has no backing table, so the effect row IS the store and
 * Social/Faction replay it without bespoke wiring. Rumors derive by
 * replaying these rows, never stored twice.
 * @param db
 * @param log
 * @param encounter
 * @param outcome
 */
async function applyReputationLeg(
  db: Kysely<DB>,
  log: ReturnType<typeof getLogger>,
  encounter: NsfwEncounter,
  outcome: EncounterOutcome,
): Promise<void> {
  try {
    const socialContext = encounter.encounterType === "public"
      ? "public"
      : encounter.encounterType === "group" ? "group" : "private";
    const success = outcome.type === "satisfaction" || outcome.type === "bonding";
    for (const participant of encounter.participants) {
      const change = calculateEncounterReputationChange(
        encounter.id,
        participant,
        success,
        socialContext,
        outcome.effects.intimacyChange,
      );
      await insertFanOutEffect(db, {
        id: `reputation:${encounter.id}:${outcome.type}:${participant}`,
        actorId: participant,
        effectId: "nsfw_reputation",
        category: "reputation",
        magnitude: change.reputationChange,
        source: "nsfw",
        sourceId: `${encounter.id}:${outcome.type}`,
        meta: jsonStringifyOr({
          event: "nsfw.reputation_changed",
          actor: participant,
          axis: socialContext,
          delta: change.reputationChange,
          reason: change.reason,
        }),
      },);
    }
    log.info(`Reputation recorded for ${encounter.id} (${outcome.type}, ${socialContext})`,);
  } catch (cause) {
    log.warn(`Reputation fan-out skipped for ${encounter.id}:`, { error: cause instanceof Error ? cause.message : String(cause), },);
  }
}

/**
 * Persist one encounter-fan-out effect row (best-effort helper).
 *
 * Extracted so `applyOutcomes` stays readable: builds the venue- and
 * reputation-style `status_effect` rows from one call site instead of
 * repeating the insert shape. Failures propagate — callers wrap each
 * leg in try/catch so a missing auxiliary row never fails completion.
 * @param db
 * @param row
 */
async function insertFanOutEffect(
  db: Kysely<DB>,
  row: {
    id: string;
    actorId: string;
    effectId: string;
    category: string;
    magnitude: number;
    source: string;
    sourceId: string;
    meta: string;
  },
): Promise<void> {
  await db
    .insertInto("status_effect",)
    .values({
      id: row.id,
      actor_id: row.actorId,
      effect_id: row.effectId,
      category: row.category,
      affected_stat: null,
      magnitude: row.magnitude,
      source: row.source,
      source_id: row.sourceId,
      started_at: new Date().toISOString(),
      expires_at: null,
      meta: row.meta,
    },)
    .execute();
}

/**
 * First participant that is not `self` (pair leg needs a target).
 * @param participants
 * @param self
 */
function firstOtherParticipant(participants: string[], self: string,): string | null {
  for (const id of participants) { if (id !== self) { return id; } }
  return null;
}

/**
 * Advance an encounter to the next phase.
 *
 * Returns triggered outcomes if the encounter completes.
 * @param db
 * @param encounterId
 */
export async function advancePhase(
  db: Kysely<DB>,
  encounterId: string,
): Promise<AdvancePhaseResult> {
  const encounter = await getEncounter(db, encounterId,);
  if (!encounter) {
    return { complete: true, phaseIndex: 0, phase: null, triggeredOutcomes: [], };
  }

  const nextPhase = encounter.currentPhase + 1;
  const isComplete = nextPhase >= encounter.phases.length;

  if (isComplete) {
    // Roll for outcomes
    const triggered = rollOutcomes(encounter.outcomes,);

    // Apply outcomes
    await applyOutcomes(db, encounter, triggered,);

    // Mark complete
    const now = new Date().toISOString();
    await db
      .updateTable("nsfw_encounters",)
      .set({
        status: "completed",
        current_phase: nextPhase,
        updated_at: now,
      },)
      .where("id", "=", encounterId,)
      .execute();

    const log = getLogger().child({ module: "encounters", },);
    log.info(`Encounter ${encounterId} completed with ${triggered.length} outcomes`,);

    return {
      complete: true,
      phaseIndex: nextPhase,
      phase: null,
      triggeredOutcomes: triggered,
    };
  }

  // Move to next phase
  const now = new Date().toISOString();
  await db
    .updateTable("nsfw_encounters",)
    .set({
      current_phase: nextPhase,
      updated_at: now,
    },)
    .where("id", "=", encounterId,)
    .execute();

  return {
    complete: false,
    phaseIndex: nextPhase,
    phase: encounter.phases[nextPhase]!,
    triggeredOutcomes: [],
  };
}
