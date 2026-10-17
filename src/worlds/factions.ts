// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/factions.ts — world factions and the pair-level diplomatic
 * ledger (migration 062).
 *
 * `faction_relationships` holds ONE row per unordered pair, normalized
 * so the lower id is always `faction_a_id`. Every read and write goes
 * through `normalizePair`, so setRelationship(a, b) and a later
 * getFactionRelationship(b, a) read the same row and a pair can never be
 * double-written.
 *
 * Transitions are validated here, once, for every caller: a pair that
 * is `hostile` or `at_war` cannot jump straight to `allied` — peace must
 * be negotiated first (see factions-diplomacy.ts).
 */
import type { Kysely, Selectable, } from "kysely";
import type { FactionAlignment, FactionDiplomaticStatus, FactionRole, } from "../db/enums-story";
import type { DB, } from "../db/schema";
import type { FactionMemberships, Factions, } from "../db/schema-core";
import { jsonParseOr, jsonStringifyOr, uid, } from "../utils";

/** Why a faction/diplomacy call was rejected. Routes map not-found→404. */
export type FactionErrorCode = "not-found" | "duplicate" | "invalid-transition" | "invalid-input";

/** Typed rejection for faction create/membership/diplomacy flows. */
export class FactionError extends Error {
  override readonly name = "FactionError";
  /**
   * @param code machine-readable reason
   * @param message human-readable detail
   */
  constructor(
    public readonly code: FactionErrorCode,
    message: string,
  ) {
    super(message,);
  }
}

/** A `factions` row as returned by SELECT. */
export type FactionRow = Selectable<Factions>;

/** A `faction_memberships` row as returned by SELECT. */
export type FactionMembershipRow = Selectable<FactionMemberships>;

/** One append-only entry of a pair's diplomatic log. */
export interface DiplomacyEvent {
  /** ISO instant the change happened. */
  at: string;
  /** Diplomatic action that caused it (`war`, `peace`, `alliance`, ...). */
  action: string;
  fromStatus: FactionDiplomaticStatus;
  toStatus: FactionDiplomaticStatus;
  /** Pair standing after the action. */
  standing: number;
  /** Free-text justification recorded by the caller. */
  reason: string;
}

/** A `faction_relationships` row with its history JSON decoded. */
export interface FactionRelationship {
  id: string;
  world_id: string;
  faction_a_id: string;
  faction_b_id: string;
  standing: number;
  status: FactionDiplomaticStatus;
  history: DiplomacyEvent[];
  updated_at: string;
}

/** Stated value of a faction (`factions.values_json`). */
export interface FactionValue {
  name: string;
  /** Relative importance of the value, -10..10. */
  weight: number;
}

/** Options for `createFaction`. */
export interface CreateFactionOptions {
  db: Kysely<DB>;
  worldId: string;
  name: string;
  description?: string;
  alignment?: FactionAlignment;
  values?: FactionValue[];
  /** Location ids the faction claims. */
  territory?: string[];
  now?: Date;
}

/**
 * Create a faction in a world.
 * @param options world, identity, and optional lore fields
 * @returns the created row
 * @throws {FactionError} invalid-input when the name is blank
 */
export async function createFaction(options: CreateFactionOptions,): Promise<FactionRow> {
  const name = options.name.trim();
  if (name.length === 0) {
    throw new FactionError("invalid-input", "faction name must not be blank",);
  }

  const id = uid();
  await options.db
    .insertInto("factions",)
    .values({
      id,
      world_id: options.worldId,
      name,
      description: options.description ?? "",
      alignment: options.alignment ?? "true_neutral",
      values_json: jsonStringifyOr(options.values ?? [],),
      territory_json: jsonStringifyOr(options.territory ?? [],),
      created_at: (options.now ?? new Date()).toISOString(),
    },)
    .execute();

  const created = await options.db
    .selectFrom("factions",)
    .selectAll()
    .where("id", "=", id,)
    .executeTakeFirstOrThrow();

  return created;
}

/**
 * List every faction in a world, oldest first.
 * @param db Kysely handle
 * @param worldId owning world
 * @returns the world's factions
 */
export async function listFactions(db: Kysely<DB>, worldId: string,): Promise<FactionRow[]> {
  return db.selectFrom("factions",).selectAll().where("world_id", "=", worldId,).orderBy("created_at", "asc",)
    .execute();
}

/** Options for `addMember`. */
export interface AddMemberOptions {
  db: Kysely<DB>;
  factionId: string;
  actorId: string;
  role?: FactionRole;
  now?: Date;
}

/**
 * Seat an actor in a faction. One seat per (faction, actor).
 * @param options faction, actor, and seat role
 * @returns the membership row
 * @throws {FactionError} not-found for an unknown faction, duplicate when
 *   the actor already holds a seat
 */
export async function addMember(options: AddMemberOptions,): Promise<FactionMembershipRow> {
  const faction = await options.db
    .selectFrom("factions",)
    .select("id",)
    .where("id", "=", options.factionId,)
    .executeTakeFirst();

  if (!faction) { throw new FactionError("not-found", `faction ${options.factionId} does not exist`,); }

  const id = uid();
  try {
    await options.db
      .insertInto("faction_memberships",)
      .values({
        id,
        faction_id: options.factionId,
        actor_id: options.actorId,
        role: options.role ?? "member",
        joined_at: (options.now ?? new Date()).toISOString(),
      },)
      .execute();
  } catch (error) {
    // Only the seat constraint is a "duplicate"; anything else (FK, disk,
    // driver) is a real fault and must keep its own identity so the route
    // layer does not report a 400 for a 500.
    const message = error instanceof Error ? error.message : String(error,);
    if (!message.includes("UNIQUE constraint failed",)) { throw error; }

    throw new FactionError(
      "duplicate",
      `actor ${options.actorId} already holds a seat in faction ${options.factionId}`,
    );
  }

  const created = await options.db
    .selectFrom("faction_memberships",)
    .selectAll()
    .where("id", "=", id,)
    .executeTakeFirstOrThrow();

  return created;
}

/**
 * Drop an actor's seat in a faction.
 * @param db Kysely handle
 * @param factionId faction to leave
 * @param actorId departing actor
 * @throws {FactionError} not-found when the seat does not exist
 */
export async function removeMember(
  db: Kysely<DB>,
  factionId: string,
  actorId: string,
): Promise<void> {
  const deleted = await db
    .deleteFrom("faction_memberships",)
    .where("faction_id", "=", factionId,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();

  if (Number(deleted.numDeletedRows ?? 0,) === 0) {
    throw new FactionError("not-found", `actor ${actorId} is not a member of ${factionId}`,);
  }
}
