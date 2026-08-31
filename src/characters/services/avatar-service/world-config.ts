// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { AvatarSelectionRule, AvatarTagType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { jsonParseOr, jsonStringifyOr, } from "../../../utils";

/** Options for upserting world avatar config */
export interface UpsertWorldAvatarConfigOpts {
  selectionRuleOverride?: AvatarSelectionRule;
  weightsOverride?: Partial<Record<AvatarTagType, number>>;
}

/** World-specific avatar config (parsed) */
export interface WorldAvatarConfig {
  id: string;
  worldId: string;
  actorId: string;
  selectionRuleOverride: AvatarSelectionRule | undefined;
  weightsOverride: Record<AvatarTagType, number> | undefined;
}

/**
 * Get world-specific avatar config
 * @param db
 * @param actorId
 * @param worldId
 */
export async function getWorldAvatarConfig(
  db: Kysely<DB>,
  actorId: string,
  worldId: string,
): Promise<WorldAvatarConfig | undefined> {
  const row = await db
    .selectFrom("world_avatar_config",)
    .where("actor_id", "=", actorId,)
    .where("world_id", "=", worldId,)
    .selectAll()
    .executeTakeFirst();

  if (!row) { return; }

  return {
    id: row.id,
    worldId: row.world_id,
    actorId: row.actor_id,
    selectionRuleOverride: row.selection_rule_override as AvatarSelectionRule | undefined,
    weightsOverride: row.weights_override
      ? jsonParseOr<Record<AvatarTagType, number>>(row.weights_override, {} as Record<AvatarTagType, number>,)
      : undefined,
  };
}

/**
 * Create or update world-specific avatar config
 * @param db
 * @param actorId
 * @param worldId
 * @param config
 */
export async function upsertWorldAvatarConfig(
  db: Kysely<DB>,
  actorId: string,
  worldId: string,
  config: UpsertWorldAvatarConfigOpts,
): Promise<string> {
  const existing = await getWorldAvatarConfig(db, actorId, worldId,);
  const now = new Date().toISOString();

  if (existing) {
    await db
      .updateTable("world_avatar_config",)
      .set({
        selection_rule_override: config.selectionRuleOverride ?? existing.selectionRuleOverride ?? null,
        weights_override: config.weightsOverride
          ? jsonStringifyOr(config.weightsOverride,)
          : (existing.weightsOverride
            ? jsonStringifyOr(existing.weightsOverride,)
            : null),
        updated_at: now,
      },)
      .where("actor_id", "=", actorId,)
      .where("world_id", "=", worldId,)
      .execute();

    return existing.id;
  }

  const id = randomUUID();
  await db
    .insertInto("world_avatar_config",)
    .values({
      id,
      world_id: worldId,
      actor_id: actorId,
      selection_rule_override: config.selectionRuleOverride ?? null,
      weights_override: config.weightsOverride
        ? jsonStringifyOr(config.weightsOverride,)
        : null,
      created_at: now,
      updated_at: now,
    },)
    .execute();

  return id;
}
