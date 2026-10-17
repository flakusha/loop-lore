// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/factions-relationships.ts — the faction-to-faction
 * diplomatic ledger (migration 062).
 *
 * One row per unordered pair: `normalizePair` sorts the two ids so the
 * lower id is always `faction_a_id`, which the UNIQUE constraint then
 * makes collision-proof. Every diplomatic action funnels through
 * `setRelationship`, so the transition rule (no hostile → allied jump)
 * and the history append live in exactly one place.
 */
import type { Kysely, } from "kysely";
import { FactionDiplomaticStatus, } from "../db/enums-story";
import type { DB, } from "../db/schema";
import { jsonParseOr, jsonStringifyOr, uid, } from "../utils";
import type { DiplomacyEvent, FactionRelationship, } from "./factions";
import { FactionError, } from "./factions";

/** Status a fresh pair starts in. */
const INITIAL_STATUS: FactionDiplomaticStatus = "neutral";

/** Standing floors for the derived status of a pair. */
const STATUS_BY_FLOOR: ReadonlyArray<readonly [number, FactionDiplomaticStatus,]> = [
  [60, "allied",],
  [20, "friendly",],
  [-20, "neutral",],
  [-60, "unfriendly",],
];

/** Statuses a pair must pass through before an alliance is possible. */
const BLOCKED_ALLIANCE_FROM: ReadonlySet<FactionDiplomaticStatus> = new Set(["hostile", "at_war",],);

/** Every accepted status — the route body is a bare string, so this is the
 * only thing standing between a typo and a raw CHECK-constraint 500. */
const KNOWN_STATUSES: ReadonlySet<string> = new Set(Object.values(FactionDiplomaticStatus,),);

/**
 * Order a faction pair canonically.
 * @param factionA one side of the pair
 * @param factionB the other side
 * @returns `[lowId, highId]`
 * @throws {FactionError} invalid-input when both ids are equal
 */
export function normalizePair(factionA: string, factionB: string,): [string, string,] {
  if (factionA === factionB) {
    throw new FactionError("invalid-input", "a faction cannot have a relationship with itself",);
  }

  return factionA < factionB ? [factionA, factionB,] : [factionB, factionA,];
}

/**
 * Read a pair's relationship, normalizing the argument order.
 * @param db Kysely handle
 * @param factionA one side of the pair
 * @param factionB the other side, in any order
 * @returns the relationship, or undefined when the pair never interacted
 * @throws {FactionError} invalid-input for a self-pair
 */
export async function getFactionRelationship(
  db: Kysely<DB>,
  factionA: string,
  factionB: string,
): Promise<FactionRelationship | undefined> {
  const [lowId, highId,] = normalizePair(factionA, factionB,);
  const row = await db
    .selectFrom("faction_relationships",)
    .selectAll()
    .where("faction_a_id", "=", lowId,)
    .where("faction_b_id", "=", highId,)
    .executeTakeFirst();

  if (!row) { return undefined; }

  return {
    id: row.id,
    world_id: row.world_id,
    faction_a_id: row.faction_a_id,
    faction_b_id: row.faction_b_id,
    standing: row.standing,
    status: row.status,
    history: jsonParseOr<DiplomacyEvent[]>(row.history_json, [],),
    updated_at: row.updated_at,
  };
}

/**
 * Derive the diplomatic status a pair score implies.
 * @param standing pair score, -100..100
 * @returns the status matching the first floor the score clears
 */
export function statusForStanding(standing: number,): FactionDiplomaticStatus {
  for (const entry of STATUS_BY_FLOOR) {
    if (standing >= entry[0]) { return entry[1]; }
  }

  return "hostile";
}

/** Options for `setRelationship`. */
export interface SetRelationshipOptions {
  db: Kysely<DB>;
  factionA: string;
  factionB: string;
  /** Target status; omitted when only `deltaStanding` is given. */
  status?: FactionDiplomaticStatus;
  /** Relative change to the pair score; the new status is derived from it. */
  deltaStanding?: number;
  /** Diplomatic action label recorded in the history entry. */
  action?: string;
  reason?: string;
  now?: Date;
}

/**
 * Move a pair's diplomatic state, appending one history entry.
 *
 * The one transition rule: a `hostile` or `at_war` pair cannot become
 * `allied` directly — a peace negotiation has to run first
 * (factions-diplomacy.ts). Every diplomatic action calls this, so the
 * rule cannot be bypassed.
 * @param options pair ids plus the status change and/or score delta
 * @returns the stored relationship with the appended history
 * @throws {FactionError} invalid-input for a self-pair or an empty patch,
 *   invalid-transition for a blocked hostile → allied jump
 */
export async function setRelationship(
  options: SetRelationshipOptions,
): Promise<FactionRelationship> {
  const [lowId, highId,] = normalizePair(options.factionA, options.factionB,);
  if (options.status === undefined && options.deltaStanding === undefined) {
    throw new FactionError("invalid-input", "setRelationship needs a status or a deltaStanding",);
  }

  if (options.status !== undefined && !KNOWN_STATUSES.has(options.status,)) {
    throw new FactionError("invalid-input", `unknown diplomatic status "${options.status}"`,);
  }

  if (options.deltaStanding !== undefined && !Number.isFinite(options.deltaStanding,)) {
    throw new FactionError("invalid-input", "deltaStanding must be a finite number",);
  }

  const existing = await getFactionRelationship(options.db, lowId, highId,);
  const fromStatus = existing?.status ?? INITIAL_STATUS;
  const standing = clampStanding((existing?.standing ?? 0) + (options.deltaStanding ?? 0),);
  // A delta-only patch re-derives the status from the NEW score, so the
  // status can never disagree with the score it was derived from.
  const nextStatus = options.status ?? statusForStanding(standing,);

  if (nextStatus === "allied" && BLOCKED_ALLIANCE_FROM.has(fromStatus,)) {
    throw new FactionError(
      "invalid-transition",
      `cannot ally while ${fromStatus}: negotiate a peace first`,
    );
  }

  const worldId = await resolveWorldId(options.db, lowId, existing,);
  const stamp = (options.now ?? new Date()).toISOString();
  const history: DiplomacyEvent[] = [
    ...(existing?.history ?? []),
    {
      at: stamp,
      action: options.action ?? options.status ?? "standing_changed",
      fromStatus,
      toStatus: nextStatus,
      standing,
      reason: options.reason ?? "",
    },
  ];

  if (existing) {
    await options.db
      .updateTable("faction_relationships",)
      .set({ standing, status: nextStatus, history_json: jsonStringifyOr(history,), updated_at: stamp, },)
      .where("id", "=", existing.id,)
      .execute();
  } else {
    await options.db
      .insertInto("faction_relationships",)
      .values({
        id: uid(),
        world_id: worldId,
        faction_a_id: lowId,
        faction_b_id: highId,
        standing,
        status: nextStatus,
        history_json: jsonStringifyOr(history,),
        updated_at: stamp,
      },)
      .execute();
  }

  const stored = await getFactionRelationship(options.db, lowId, highId,);
  if (!stored) {
    throw new FactionError("not-found", `relationship row for ${lowId}/${highId} vanished`,);
  }

  return stored;
}

/**
 * @param standing raw score
 * @returns the score clamped to the -100..100 column range
 */
export function clampStanding(standing: number,): number {
  return Math.max(-100, Math.min(100, standing,),);
}

/**
 * World that owns a pair — the stored row's, else the first faction's.
 * @param db Kysely handle
 * @param lowId canonically-first faction id
 * @param existing stored relationship, when the pair already has one
 * @returns the world id
 * @throws {FactionError} not-found when the faction does not exist
 */
async function resolveWorldId(
  db: Kysely<DB>,
  lowId: string,
  existing: FactionRelationship | undefined,
): Promise<string> {
  if (existing) { return existing.world_id; }

  const faction = await db
    .selectFrom("factions",)
    .select("world_id",)
    .where("id", "=", lowId,)
    .executeTakeFirst();

  if (!faction) { throw new FactionError("not-found", `faction ${lowId} does not exist`,); }

  return faction.world_id;
}
