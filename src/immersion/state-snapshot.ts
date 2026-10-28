// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Immersion Gate — Actor State Snapshot (WI-2 adapters)
 *
 * Assembles the {@link ActorStateSnapshot} the deterministic rules check
 * against. SC10-style adapter over the ground truth that exists today:
 * `character_stats` (state + conditions), `character_skills` (ownership),
 * `world_items` (inventory membership).
 *
 * SEAM: when `epic-player-state-machine` lands, this module becomes a thin
 * shim over the canonical layered state; rule code does not change (it only
 * reads the snapshot).
 *
 * DB access: Kysely instance passed in, typed via `DB` — this module never
 * imports DB driver modules (service convention).
 *
 * @module immersion/state-snapshot
 */
import type { Kysely, } from "kysely";
import { CharacterState, } from "../db/enums";
import type { DB, } from "../db/schema";
import { SkillsService, } from "../rpg/skills";
import { ItemsService, } from "../story/items";
import { jsonParseOr, } from "../utils";
import type { ActorStateSnapshot, PendingConsequence, } from "./types";

/** Restriction condition vocabulary (deterministic, lowercase substrings). */
const RESTRICTION_CONDITIONS: readonly string[] = [
  "restrain",
  "bound",
  "tied",
  "captive",
  "captured",
  "chained",
  "shackle",
  "imprison",
  "web",
  "paralys",
  "paralyz",
  "stun",
  "petrifi",
  "locked in",
  "locked up",
] as const;

/** Character states that make any movement claim impossible. */
const INCAPACITATING_STATES: readonly string[] = [
  CharacterState.Unconscious,
  CharacterState.Dead,
] as const;

/** A `conditions` JSON entry: structured object or legacy bare string. */
interface ConditionEntry {
  readonly name?: string;
}

function isConditionEntry(entry: unknown,): entry is ConditionEntry | string {
  return typeof entry === "string" ||
    (typeof entry === "object" && entry !== null && "name" in entry);
}

/**
 * Parse `character_stats.conditions` (JSON array) into lowercase names.
 * Tolerates legacy bare-string arrays and malformed JSON (→ empty).
 * @param {string | null} raw
 * @returns {string[]}
 */
function parseConditionNames(raw: string | null,): string[] {
  const parsed = jsonParseOr<unknown>(raw ?? "[]", [],);
  if (!Array.isArray(parsed,)) {
    return [];
  }

  const names: string[] = [];
  for (const entry of parsed) {
    if (!isConditionEntry(entry,)) {
      continue;
    }

    const name = typeof entry === "string" ? entry : entry.name;
    if (typeof name === "string" && name.trim().length > 0) {
      names.push(name.trim().toLowerCase(),);
    }
  }

  return names;
}

/**
 * Derive the `restricted` flag: an incapacitating character state or a
 * restriction-vocabulary condition hit. This is the deterministic stand-in
 * for the future player-state-machine layer flags (captive/restrained).
 * @param {object} args
 * @param {string} args.characterState
 * @param {readonly string[]} args.conditions
 * @returns {boolean}
 */
export function deriveRestricted(args: {
  characterState: string;
  conditions: readonly string[];
},): boolean {
  const { characterState, conditions, } = args;
  if (INCAPACITATING_STATES.includes(characterState,)) {
    return true;
  }

  return conditions.some((condition,) => RESTRICTION_CONDITIONS.some((needle,) => condition.includes(needle,)));
}

/**
 * Build the authoritative actor state snapshot for one gate evaluation.
 *
 * Three small indexed reads: `character_stats` row, the actor's skills, and
 * (when a world is bound) the actor's carried items. Missing rows degrade to
 * empty state — an actor without stats is simply unrestricted.
 * @param {object} args
 * @param {Kysely<DB>} args.db
 * @param {string} args.actorId
 * @param {string | null} args.worldId — inventory checks skipped when null
 * @param {readonly PendingConsequence[]} [args.pendingConsequences]
 * @returns {Promise<ActorStateSnapshot>}
 */
export async function buildActorStateSnapshot(args: {
  db: Kysely<DB>;
  actorId: string;
  worldId: string | null;
  pendingConsequences?: readonly PendingConsequence[];
},): Promise<ActorStateSnapshot> {
  const { db, actorId, worldId, } = args;

  const statsRow = await db
    .selectFrom("character_stats",)
    .select(["character_state", "conditions",],)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();

  const characterState = statsRow?.character_state ?? "unknown";
  const conditions = parseConditionNames(statsRow?.conditions ?? null,);

  const skills = await new SkillsService(db,).getActorSkills(
    actorId,
    worldId ?? undefined,
  );

  const inventory = worldId === null
    ? []
    : await new ItemsService(db,).getNpcInventory(actorId, worldId,);

  return {
    actorId,
    characterState,
    conditions,
    restricted: deriveRestricted({ characterState, conditions, },),
    skills: Array.from(skills, (skill,) => skill.name.toLowerCase(),),
    inventory: Array.from(inventory, (item,) => item.name.toLowerCase(),),
    pendingConsequences: args.pendingConsequences ?? [],
  };
}
