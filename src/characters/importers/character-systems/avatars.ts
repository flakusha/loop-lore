// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Import avatar data into the character systems importer result.

import type { Kysely, } from "kysely";
import { AvatarSelectionRule, AvatarTagType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import type { CharacterSystemsExport, ExportedWorldAvatarConfig, } from "../../exporters/character-systems";
import { AvatarService, } from "../../services/avatar-service";
import type { UpsertAvatarConfigOpts, UpsertWorldAvatarConfigOpts, } from "../../services/avatar-service";
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
    const config = parseAvatarConfig(data.config,);
    if (!config) {
      result.errors.push("Skipped malformed avatar config entry.",);
    } else {
      try {
        await avatarService.upsertAvatarConfig(actorId, config,);
      } catch (error: unknown) {
        result.errors.push(`Failed to import avatar config: ${errMsg(error,)}`,);
      }
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
  configs: readonly ExportedWorldAvatarConfig[],
  result: CharacterSystemsImportResult,
  worldId?: string,
): Promise<void> {
  for (const config of configs) {
    const parsed = parseWorldAvatarConfig(config,);
    if (!parsed) {
      result.errors.push("Skipped malformed avatar world config entry.",);

      continue;
    }

    const { sourceWorldId, opts, } = parsed;
    if (!worldId || (sourceWorldId && sourceWorldId !== worldId)) {
      result.errors.push(
        `Skipped avatar world config for world "${sourceWorldId ?? "unknown"}" (import target: ${worldId ?? "none"}).`,
      );

      continue;
    }

    try {
      await avatarService.upsertWorldAvatarConfig(actorId, worldId, opts,);
    } catch (error: unknown) {
      result.errors.push(`Failed to import avatar world config: ${errMsg(error,)}`,);
    }
  }
}

/** Validated form of one imported world-avatar entry. */
interface ParsedWorldAvatarConfig {
  sourceWorldId: string | undefined;
  opts: UpsertWorldAvatarConfigOpts;
}

/**
 * Validate one imported world-avatar entry. The bundle is parsed JSON, so a
 * malformed `selectionRule` or a non-numeric weight must be reported rather
 * than written into the row.
 * @param raw - One `worldConfigs` entry straight from the bundle
 * @returns the validated entry, or undefined when it is unusable
 */
function parseWorldAvatarConfig(raw: unknown,): ParsedWorldAvatarConfig | undefined {
  if (typeof raw !== "object" || raw === null) { return; }

  const config = parseAvatarConfig(raw,);
  if (!config) { return; }

  const sourceWorldId = "worldId" in raw && typeof raw.worldId === "string" ? raw.worldId : undefined;

  return {
    sourceWorldId,
    opts: { selectionRuleOverride: config.selectionRule, weightsOverride: config.weights, },
  };
}

/**
 * Validate an imported avatar config. The bundle is parsed JSON, so an unknown
 * selection rule, a non-numeric weight or an unknown tag must be reported
 * rather than written into `character_avatar_config`.
 * @param raw - `avatars.config` straight from the bundle
 * @returns the validated options, or undefined when unusable
 */
function parseAvatarConfig(raw: unknown,): UpsertAvatarConfigOpts | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw,)) { return; }

  const selectionRule = "selectionRule" in raw && typeof raw.selectionRule === "string"
    ? raw.selectionRule
    : undefined;

  if (selectionRule !== undefined && !isSelectionRule(selectionRule,)) { return; }

  const weights = "weights" in raw ? readWeightMap(raw.weights,) : undefined;
  if (weights === null) { return; }

  const fallbackOrder = "fallbackOrder" in raw ? readTagList(raw.fallbackOrder,) : undefined;
  if (fallbackOrder === null) { return; }

  return { selectionRule, weights, fallbackOrder, };
}

/**
 * Read a tag list, rejecting unknown tags.
 * @param raw - Candidate `fallbackOrder` value from the bundle
 * @returns the tag list, undefined when absent, or null when malformed
 */
function readTagList(raw: unknown,): AvatarTagType[] | null | undefined {
  if (raw === undefined) { return; }
  if (!Array.isArray(raw,)) { return null; }

  const tags: AvatarTagType[] = [];
  for (const tag of raw) {
    if (typeof tag !== "string" || !isTagType(tag,)) { return null; }

    tags.push(tag,);
  }

  return tags;
}

/**
 * Whether a value is one of the declared avatar tag types.
 * @param value - Candidate tag string
 * @returns true when the tag is declared in {@link AvatarTagType}
 */
function isTagType(value: string,): value is AvatarTagType {
  return Object.values(AvatarTagType,).includes(value as AvatarTagType,);
}

/**
 * Whether a value is one of the declared avatar selection rules.
 * @param value - Candidate rule string
 * @returns true when the rule is declared in {@link AvatarSelectionRule}
 */
function isSelectionRule(value: string,): value is AvatarSelectionRule {
  return Object.values(AvatarSelectionRule,).includes(value as AvatarSelectionRule,);
}

/**
 * Read a weight map, rejecting non-numeric entries.
 * @param raw - Candidate `weights` value from the bundle
 * @returns the weight map, undefined when absent, or null when malformed
 */
function readWeightMap(raw: unknown,): Partial<Record<AvatarTagType, number>> | null | undefined {
  if (raw === undefined) { return; }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw,)) { return null; }

  const entries = Object.entries(raw,);
  const valid = entries.every(([, weight,],) => typeof weight === "number" && Number.isFinite(weight,));
  if (!valid) { return null; }

  return Object.fromEntries(entries,) as Partial<Record<AvatarTagType, number>>;
}
