// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Level-up decisions for autonomous actors (FEAT-level-up-decision).
 *
 * When the LevelService stages ASI points, a pending decision is recorded:
 * for chat-attached awards a `level_up` question is created through the
 * shared questions service (options = per-ability +2, plus an `auto` escape
 * hatch), and the budget itself lives on `character_stats.pending_asi`.
 *
 * Autonomous actors (`actors.agent_type != 'none'`) never block: their
 * pending budget is spent immediately by the deterministic affinity
 * allocator — the highest-xp skill's category picks the governing ability,
 * an `enemy` combat alignment skews physical, canonical order breaks ties.
 * Human actors keep the budget pending until they (or their LLM) resolve it
 * through the questions surface or the progression API.
 */
import type { Kysely, } from "kysely";
import { AgentType, } from "../../db/enums";
import { RpgQuestionType, } from "../../db/enums-story";
import type { DB, } from "../../db/schema.js";
import { getLogger, } from "../../logger";
import { createQuestion, } from "../questions/index.js";
import { type AbilityName, ALL_ABILITIES, } from "../stats/types.js";
import { ASI_MAX, } from "../xp/constants.js";
import { allocateAsi, type AllocateAsiResult, } from "./asi.js";

/** Skill category → governing ability (category is what the rows store). */
const CATEGORY_ABILITY: Record<string, AbilityName> = {
  combat: "str",
  magic: "int",
  crafting: "int",
  social: "cha",
  exploration: "dex",
  survival: "wis",
  knowledge: "int",
  stealth: "dex",
};

/** Physical abilities boosted when the actor is aligned against the party. */
const PHYSICAL: ReadonlySet<AbilityName> = new Set<AbilityName>(["str", "con",],);

/** A resolved level-up decision. */
export interface LevelUpResolution {
  /** How the budget was spent. */
  spends: AllocateAsiResult[];
  /** Points left pending (only when every ability is at ASI_MAX). */
  remaining: number;
}

/**
 * Spend the whole pending budget with the affinity allocator.
 * Deterministic: one point at a time, ability = argmax(skill-affinity +
 * alignment weight, capped abilities skipped, canonical tie-break).
 * @param db
 * @param actorId
 * @returns The per-point spends and whatever had to stay pending.
 */
export async function autoAllocateAsi(
  db: Kysely<DB>,
  actorId: string,
): Promise<LevelUpResolution> {
  const affinity = await affinityWeights(db, actorId,);
  const spends: AllocateAsiResult[] = [];

  // `remaining` from each round is the live budget; the loop stops when the
  // allocator cannot spend (empty budget or everything capped).
  for (;;) {
    const stats = await db
      .selectFrom("character_stats",)
      .where("actor_id", "=", actorId,)
      .select(["pending_asi", "str", "dex", "con", "int", "wis", "cha",],)
      .executeTakeFirst();

    if (!stats || stats.pending_asi <= 0) { break; }

    const target = pickWeighted(affinity, stats,);
    if (!target) { break; }

    spends.push(await allocateAsi(db, { actorId, ability: target, points: 1, },),);
  }

  const final = await readPendingBudget(db, actorId,);

  return { spends, remaining: final?.pending_asi ?? 0, };
}

/**
 * Stage a pending level-up decision for the actor.
 * Creates the chat question when the award carries a chat; the pending
 * budget is authoritative either way.
 * @param db
 * @param actorId
 * @param chatId
 * @returns The question id, or null when nothing is pending / no chat.
 */
export async function stageLevelUpDecision(
  db: Kysely<DB>,
  actorId: string,
  chatId?: string,
): Promise<string | null> {
  const stats = await db
    .selectFrom("character_stats",)
    .where("actor_id", "=", actorId,)
    .select("pending_asi",)
    .executeTakeFirst();

  if (!stats || stats.pending_asi <= 0 || !chatId) { return null; }

  const question = await createQuestion(db, {
    chatId,
    actorId,
    type: RpgQuestionType.LevelUp,
    prompt: `Level up: ${stats.pending_asi} ability point(s) to allocate`,
    options: [
      ...ALL_ABILITIES.map((a,) => {
        return { id: `asi:${a}+2`, text: `+2 ${a.toUpperCase()}`, };
      },),
      { id: "asi:auto", text: "Auto (affinity allocation)", },
    ],
  },);

  return question.id;
}

/** A decision payload as accepted by the resolve path. */
export type LevelUpChoice =
  | { kind: "auto" }
  | { kind: "asi"; ability: AbilityName; points?: number };

/**
 * Resolve a pending level-up with an explicit choice (or the affinity
 * allocator when no choice is given).
 * @param db
 * @param actorId
 * @param choice
 * @returns The resulting spends.
 * @throws {LevelServiceError} Propagates allocation errors from `allocateAsi`.
 */
export async function resolveLevelUpDecision(
  db: Kysely<DB>,
  actorId: string,
  choice?: LevelUpChoice,
): Promise<LevelUpResolution> {
  if (!choice || choice.kind === "auto") {
    return autoAllocateAsi(db, actorId,);
  }

  const spend = await allocateAsi(db, {
    actorId,
    ability: choice.ability,
    points: choice.points ?? 2,
  },);

  return { spends: [spend,], remaining: spend.remaining, };
}

/**
 * Auto-resolve pending decisions for autonomous actors right after staging,
 * so a level threshold can never block an LLM actor's turn.
 * @param db
 * @param actorId
 * @returns the resolution applied to the pending decision, or null for a player-controlled actor
 */
export async function autoResolveIfAutonomous(
  db: Kysely<DB>,
  actorId: string,
): Promise<LevelUpResolution | null> {
  const actor = await db
    .selectFrom("actors",)
    .where("id", "=", actorId,)
    .select("agent_type",)
    .executeTakeFirst();

  if (!actor || actor.agent_type === AgentType.None) { return null; }

  try {
    return await autoAllocateAsi(db, actorId,);
  } catch (cause) {
    getLogger().child({ module: "rpg-level", },).warn(`Auto level-up resolution failed for ${actorId}:`, {
      error: cause instanceof Error ? cause.message : String(cause,),
    },);

    return null;
  }
}

/**
 * Affinity weights: highest-xp skill's category, +2 physical for enemies.
 * @param db
 * @param actorId
 */
async function affinityWeights(db: Kysely<DB>, actorId: string,): Promise<Map<AbilityName, number>> {
  const weights = new Map<AbilityName, number>(ALL_ABILITIES.map((a,) => [a, 0,]),);

  const topSkill = await db
    .selectFrom("character_skills",)
    .where("actor_id", "=", actorId,)
    .select(["category", "xp",],)
    .orderBy("xp", "desc",)
    .orderBy("name", "asc",)
    .limit(1,)
    .executeTakeFirst();

  if (topSkill) {
    const governed = CATEGORY_ABILITY[topSkill.category] ?? "int";
    weights.set(governed, (weights.get(governed,) ?? 0) + 2,);
  }

  const stats = await db
    .selectFrom("character_stats",)
    .where("actor_id", "=", actorId,)
    .select("combat_alignment",)
    .executeTakeFirst();

  if (stats?.combat_alignment === "enemy") {
    for (const ability of PHYSICAL) {
      weights.set(ability, (weights.get(ability,) ?? 0) + 2,);
    }
  }

  return weights;
}

/**
 * Argmax over uncapped abilities with room for the whole budget spend.
 * @param weights
 * @param stats
 * @param stats.pending_asi
 * @param stats.str
 * @param stats.dex
 * @param stats.con
 * @param stats.int
 * @param stats.wis
 * @param stats.cha
 */
function pickWeighted(
  weights: Map<AbilityName, number>,
  stats: { pending_asi: number; str: number; dex: number; con: number; int: number; wis: number; cha: number },
): AbilityName | null {
  let best: AbilityName | null = null;
  let bestWeight = 0;
  for (const ability of ALL_ABILITIES) {
    if (stats[ability] >= ASI_MAX) { continue; }
    if (best === null || (weights.get(ability,) ?? 0) > bestWeight) {
      best = ability;
      bestWeight = weights.get(ability,) ?? 0;
    }
  }

  return best;
}

/**
 * Read the actor's pending ASI budget (the shared projection for the
 * allocation loop and its final reconcile read).
 * @param db
 * @param actorId
 */
async function readPendingBudget(db: Kysely<DB>, actorId: string,): Promise<{ pending_asi: number } | undefined> {
  return db
    .selectFrom("character_stats",)
    .where("actor_id", "=", actorId,)
    .select("pending_asi",)
    .executeTakeFirst();
}
