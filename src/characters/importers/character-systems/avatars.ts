// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Import avatar data into the character systems importer result.

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import type { CharacterSystemsExport, } from "../../exporters/character-systems";
import { AvatarService, } from "../../services/avatar-service";
import { errMsg, } from "../../shared/character-systems-utils";
import type { CharacterSystemsImportResult, } from "./types";

/**
 * Import avatars + avatar config into the character systems importer result.
 *
 * `worldConfigs` entries are keyed by world; an entry whose `worldId` matches
 * the import target is upserted, and a mismatched one is reported rather than
 * written into the wrong world.
 * @param db
 * @param actorId
 * @param data
 * @param result
 * @param worldId - Target world, when the import is world-scoped
 * @returns {Promise<void>}
 */
export async function importAvatars(
  db: Kysely<DB>,
  actorId: string,
  data: CharacterSystemsExport["avatars"],
  result: CharacterSystemsImportResult,
  worldId?: string,
): Promise<void> {
  if (!data) { return; }
  const avatarService = new AvatarService(db,);

  for (const avatar of data.avatars) {
    try {
      await avatarService.createAvatar({
        actorId,
        assetId: avatar.assetId as string,
        label: avatar.label as string,
        tags: avatar.tags as any,
        isPrimary: avatar.isPrimary as boolean,
        sortOrder: avatar.sortOrder as number,
      },);

      result.avatarsImported++;
    } catch (error: unknown) {
      result.errors.push(`Failed to import avatar "${String(avatar.label,)}": ${errMsg(error,)}`,);
    }
  }

  if (data.config) {
    try {
      await avatarService.upsertAvatarConfig(actorId, {
        selectionRule: data.config.selectionRule as any,
        weights: data.config.weights as any,
        fallbackOrder: data.config.fallbackOrder as any,
      },);
    } catch (error: unknown) {
      result.errors.push(`Failed to import avatar config: ${errMsg(error,)}`,);
    }
  }

  await importAvatarWorldConfigs(avatarService, actorId, data.worldConfigs ?? [], result, worldId,);
}

/**
 * Import per-world avatar overrides, refusing a bundle built for another world.
 * @param avatarService - Avatar service bound to the target database
 * @param actorId - Target character actor id
 * @param configs - Exported `worldConfigs` entries
 * @param result - Mutable import result (`errors`)
 * @param worldId - Target world, when the import is world-scoped
 */
async function importAvatarWorldConfigs(
  avatarService: AvatarService,
  actorId: string,
  configs: Record<string, unknown>[],
  result: CharacterSystemsImportResult,
  worldId?: string,
): Promise<void> {
  for (const config of configs) {
    const sourceWorldId = config.worldId as string | undefined;
    if (!worldId || (sourceWorldId && sourceWorldId !== worldId)) {
      result.errors.push(
        `Skipped avatar world config for world "${sourceWorldId ?? "unknown"}" (import target: ${worldId ?? "none"}).`,
      );

      continue;
    }

    try {
      await avatarService.upsertWorldAvatarConfig(actorId, worldId, {
        selectionRuleOverride: config.selectionRule as any,
        weightsOverride: config.weights as any,
      },);
    } catch (error: unknown) {
      result.errors.push(`Failed to import avatar world config: ${errMsg(error,)}`,);
    }
  }
}
