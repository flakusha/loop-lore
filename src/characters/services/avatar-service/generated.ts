// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/services/avatar-service/generated.ts
//
// Avatar Dogfood — actor-avatar binding op for generated variants
// (TASK-avatar-dogfood-assistant-generation, slice 1).
//
// The generation pipeline persists image buffers through
// `persistGeneratedImages` (src/assets/service/persist-generated.ts), which
// deliberately leaves avatar rows to the caller. This op is that follow-up
// for the dogfood loop: it turns freshly persisted assets into labeled
// `generated` avatar variants on a target actor. Rollback contract: if any
// binding fails mid-run, every avatar row (and its actor asset link) created
// by THIS call is removed before the error propagates — a failed generation
// never leaves a partial avatar binding behind.

import type { Kysely, } from "kysely";
import { AssetLinkEntity, } from "../../../db/enums-content";
import type { DB, } from "../../../db/schema";
import { createAvatar, } from "./crud";

/** Options for {@link bindGeneratedActorAvatar}. */
export interface BindGeneratedAvatarOpts {
  /** Actor the variants are bound to. Caller has already proven ownership. */
  actorId: string;
  /** Persisted asset ids, in generation order. */
  assetIds: string[];
  /** Variant label; defaults to `"generated"`. */
  label?: string;
}

/**
 * Bind persisted generation output as avatar variants on an actor.
 *
 * Each asset becomes one non-primary `character_avatars` row (label
 * `generated`, sort order = generation index). On any failure the rows and
 * actor-links created by this call are deleted and the error re-thrown, so
 * the caller can surface a failure without a half-bound actor.
 * @param db   Kysely database handle.
 * @param opts Binding target, assets, and optional label.
 * @returns The created avatar ids, in input order.
 * @throws {Error} When an empty `assetIds` is supplied, or when any insert
 *   fails (after rolling back this call's rows).
 */
export async function bindGeneratedActorAvatar(
  db: Kysely<DB>,
  opts: BindGeneratedAvatarOpts,
): Promise<string[]> {
  if (opts.assetIds.length === 0) {
    throw new Error("bindGeneratedActorAvatar: no assets to bind",);
  }

  const label = opts.label ?? "generated";
  const avatarIds: string[] = [];
  const boundAssetIds: string[] = [];

  try {
    for (const [index, assetId,] of opts.assetIds.entries()) {
      avatarIds.push(
        await createAvatar(db, {
          actorId: opts.actorId,
          assetId,
          label,
          isPrimary: false,
          sortOrder: index,
        },),
      );

      boundAssetIds.push(assetId,);
    }
  } catch (error) {
    // Unwind only what this call created: the avatar rows above, plus the
    // `avatar`-labeled actor links createAvatar attached for them. Best-effort
    // by necessity (the original error is the one worth surfacing).
    await db
      .deleteFrom("character_avatars",)
      .where("id", "in", avatarIds,)
      .execute()
      .catch(() => undefined);

    await db
      .deleteFrom("asset_links",)
      .where("entity_type", "=", AssetLinkEntity.Actor,)
      .where("entity_id", "=", opts.actorId,)
      .where("label", "=", "avatar",)
      .where("asset_id", "in", boundAssetIds,)
      .execute()
      .catch(() => undefined);

    throw error;
  }

  return avatarIds;
}
