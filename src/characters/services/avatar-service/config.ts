// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { AvatarSelectionRule, AvatarTagType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { jsonParseOr, jsonStringifyOr, } from "../../../utils";
import type { AvatarConfig, } from "./types";

/** Options for upserting avatar config */
export interface UpsertAvatarConfigOpts {
  selectionRule?: AvatarSelectionRule;
  weights?: Partial<Record<AvatarTagType, number>>;
  fallbackChain?: AvatarTagType[];
}

/** Get avatar config for a character */
export async function getAvatarConfig(db: Kysely<DB>, actorId: string,): Promise<AvatarConfig | undefined> {
  const row = await db
    .selectFrom("character_avatar_config",)
    .where("actor_id", "=", actorId,)
    .selectAll()
    .executeTakeFirst();

  if (!row) { return undefined; }

  return {
    id: row.id,
    actorId: row.actor_id,
    selectionRule: row.selection_rule as AvatarSelectionRule,
    weights: jsonParseOr<Record<AvatarTagType, number>>(row.weights ?? "{}", {} as Record<AvatarTagType, number>,),
    fallbackChain: jsonParseOr<AvatarTagType[]>(row.fallback_chain ?? "[]", [] as AvatarTagType[],),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Create or update avatar config */
export async function upsertAvatarConfig(
  db: Kysely<DB>,
  actorId: string,
  config: UpsertAvatarConfigOpts,
): Promise<string> {
  const now = new Date().toISOString();

  // Get raw database row
  const existingRow = await db
    .selectFrom("character_avatar_config",)
    .where("actor_id", "=", actorId,)
    .selectAll()
    .executeTakeFirst();

  if (existingRow) {
    const existingWeights = jsonParseOr<Record<AvatarTagType, number>>(
      existingRow.weights ?? "{}",
      {} as Record<AvatarTagType, number>,
    );
    const mergedWeights = config.weights
      ? { ...existingWeights, ...config.weights, }
      : existingWeights;
    const fallbackChain = config.fallbackChain
      ? jsonStringifyOr(config.fallbackChain,)
      : existingRow.fallback_chain;

    await db
      .updateTable("character_avatar_config",)
      .set({
        selection_rule: config.selectionRule ?? existingRow.selection_rule,
        weights: jsonStringifyOr(mergedWeights,),
        fallback_chain: fallbackChain,
        updated_at: now,
      },)
      .where("actor_id", "=", actorId,)
      .execute();

    return existingRow.id;
  }

  const id = randomUUID();
  const defaultWeights = {
    emotion: 0.4,
    mood: 0.3,
    action: 0.2,
    location: 0.1,
    time: 0.05,
    outfit: 0.05,
  };

  await db
    .insertInto("character_avatar_config",)
    .values({
      id,
      actor_id: actorId,
      selection_rule: config.selectionRule ?? "emotion_first",
      weights: jsonStringifyOr(config.weights ?? defaultWeights,),
      fallback_chain: jsonStringifyOr(config.fallbackChain ?? [],),
      created_at: now,
      updated_at: now,
    },)
    .execute();

  return id;
}
