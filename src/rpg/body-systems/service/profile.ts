// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { BodyBuild, SizeCategory, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { jsonParseOr, jsonStringifyOr, uid, } from "../../../utils";
import type {
  BodyModification,
  BodyProfile,
  UpdateBodyProfileOpts,
} from "./types";

/**
 * Convert database row to BodyProfile object
 * @param row
 * @param row.id
 * @param row.actor_id
 * @param row.stamina
 * @param row.flexibility
 * @param row.sensitivity
 * @param row.endurance
 * @param row.size_category
 * @param row.build
 * @param row.beauty
 * @param row.charisma
 * @param row.style
 * @param row.scent
 * @param row.modifications
 * @param row.created_at
 * @param row.updated_at
 */
export function rowToProfile(row: {
  id: string;
  actor_id: string;
  stamina: number;
  flexibility: number;
  sensitivity: number;
  endurance: number;
  size_category: SizeCategory;
  build: BodyBuild;
  beauty: number;
  charisma: number;
  style: number;
  scent: string | null;
  modifications: string;
  created_at: string;
  updated_at: string;
},): BodyProfile {
  return {
    id: row.id,
    actorId: row.actor_id,
    stamina: row.stamina,
    flexibility: row.flexibility,
    sensitivity: row.sensitivity,
    endurance: row.endurance,
    sizeCategory: row.size_category,
    build: row.build,
    beauty: row.beauty,
    charisma: row.charisma,
    style: row.style,
    scent: row.scent,
    modifications: jsonParseOr(row.modifications, [],),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Clamp a value to 1–100 range.
 * @param value
 */
function clamp(value: number,): number {
  return Math.max(1, Math.min(100, value,),);
}

/**
 * Get or create a body profile for an actor.
 * @param db
 * @param actorId
 */
export async function getProfile(
  db: Kysely<DB>,
  actorId: string,
): Promise<BodyProfile> {
  const row = await db
    .selectFrom("character_body_profile",)
    .where("actor_id", "=", actorId,)
    .selectAll()
    .executeTakeFirst();

  if (row) {
    return rowToProfile(row as any,);
  }

  // Create default profile
  const now = new Date().toISOString();
  const id = uid();

  await db
    .insertInto("character_body_profile",)
    .values({
      id,
      actor_id: actorId,
      stamina: 50,
      flexibility: 50,
      sensitivity: 50,
      endurance: 50,
      size_category: "average",
      build: "average",
      beauty: 50,
      charisma: 50,
      style: 50,
      scent: null,
      modifications: "[]",
      created_at: now,
      updated_at: now,
    },)
    .execute();

  return {
    id,
    actorId,
    stamina: 50,
    flexibility: 50,
    sensitivity: 50,
    endurance: 50,
    sizeCategory: "average",
    build: "average",
    beauty: 50,
    charisma: 50,
    style: 50,
    scent: null,
    modifications: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update a body profile.
 * @param db
 * @param actorId
 * @param updates
 */
export async function updateProfile(
  db: Kysely<DB>,
  actorId: string,
  updates: UpdateBodyProfileOpts,
): Promise<boolean> {
  // Ensure profile exists
  await getProfile(db, actorId,);

  const now = new Date().toISOString();
  const clause: Record<string, unknown> = { updated_at: now, };

  if (updates.stamina !== undefined) { clause.stamina = clamp(updates.stamina,); }
  if (updates.flexibility !== undefined) { clause.flexibility = clamp(updates.flexibility,); }
  if (updates.sensitivity !== undefined) { clause.sensitivity = clamp(updates.sensitivity,); }
  if (updates.endurance !== undefined) { clause.endurance = clamp(updates.endurance,); }
  if (updates.sizeCategory !== undefined) { clause.size_category = updates.sizeCategory; }
  if (updates.build !== undefined) { clause.build = updates.build; }
  if (updates.beauty !== undefined) { clause.beauty = clamp(updates.beauty,); }
  if (updates.charisma !== undefined) { clause.charisma = clamp(updates.charisma,); }
  if (updates.style !== undefined) { clause.style = clamp(updates.style,); }
  if (updates.scent !== undefined) { clause.scent = updates.scent; }

  const result = await db
    .updateTable("character_body_profile",)
    .set(clause,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();

  return (result.numUpdatedRows ?? 0n) > 0n;
}

/**
 * Add a body modification.
 * @param db
 * @param actorId
 * @param modification
 */
export async function addModification(
  db: Kysely<DB>,
  actorId: string,
  modification: BodyModification,
): Promise<void> {
  const profile = await getProfile(db, actorId,);
  const mods = [...profile.modifications, modification,];

  const now = new Date().toISOString();
  await db
    .updateTable("character_body_profile",)
    .set({
      modifications: jsonStringifyOr(mods,),
      updated_at: now,
    },)
    .where("actor_id", "=", actorId,)
    .execute();
}

/**
 * Remove a body modification by index.
 * @param db
 * @param actorId
 * @param index
 */
export async function removeModification(
  db: Kysely<DB>,
  actorId: string,
  index: number,
): Promise<boolean> {
  const profile = await getProfile(db, actorId,);
  if (index < 0 || index >= profile.modifications.length) { return false; }

  const mods: typeof profile.modifications = [];
  for (let i = 0; i < profile.modifications.length; i++) {
    if (i !== index) { mods.push(profile.modifications[i]!,); }
  }

  const now = new Date().toISOString();
  await db
    .updateTable("character_body_profile",)
    .set({
      modifications: jsonStringifyOr(mods,),
      updated_at: now,
    },)
    .where("actor_id", "=", actorId,)
    .execute();

  return true;
}
