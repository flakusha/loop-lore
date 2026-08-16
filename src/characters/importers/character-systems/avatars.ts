// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/importers/character-systems/avatars.ts — Import avatar data

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import type { CharacterSystemsExport, } from "../../exporters/character-systems";
import { AvatarService, } from "../../services/avatar-service";
import { errMsg, } from "../../shared/character-systems-utils";
import type { CharacterSystemsImportResult, } from "./types";

/** Import avatars + avatar config into the character systems importer result. */
export async function importAvatars(
  db: Kysely<DB>,
  actorId: string,
  data: CharacterSystemsExport["avatars"],
  result: CharacterSystemsImportResult,
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
        fallbackChain: data.config.fallbackChain as any,
      },);
    } catch (error: unknown) {
      result.errors.push(`Failed to import avatar config: ${errMsg(error,)}`,);
    }
  }
}
