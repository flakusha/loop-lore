// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * IVSS retake seam. A completed fragment's latent package is reusable as the
 * starting point of a new fragment row; the workflow contract decides which
 * node consumes `{{latent_path}}`. Nothing here names a ComfyUI node pack.
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { existsSync, } from "node:fs";
import { getAssetFilePath, } from "../../assets/service/file-system";
import { getOwnedAsset, } from "../../assets/service/read";
import { FragmentStatus, } from "../../db/enums-generation";
import type { DB, } from "../../db/schema";
import { safeJsonStringify, } from "../../utils";
import { toDate, } from "../../utils/date";

/** Minimal target shape needed to validate retake lineage and workflow pin. */
export interface RetakeTargetFragment {
  id: string;
  parent_fragment_id: string | null;
  workflow_id: string;
  workflow_hash: string;
}

export interface RetakeLatent {
  /** Asset id of the parent latent package */
  assetId: string;
  /** Local filesystem path exposed to the workflow as `{{latent_path}}` */
  path: string;
  /** Take label of the parent fragment */
  parentTake: string;
}

/**
 * @param opts - database, caller, source fragment and optional clock
 * @throws {Error} When the source is missing, foreign, incomplete or has no latent
 * @returns id and take label of the new Planned fragment row
 */
export async function createIvssFragmentRetake(opts: {
  database: Kysely<DB>;
  fragmentId: string;
  ownerId: string;
  now?: () => number;
},): Promise<{ fragmentId: string; parentFragmentId: string; take: string; latentAssetId: string }> {
  const db = opts.database;
  const timestamp = () => toDate((opts.now ?? Date.now)(),).toISOString();
  const source = await db.selectFrom("scenario_fragments",).selectAll()
    .where("id", "=", opts.fragmentId,).executeTakeFirstOrThrow();

  const owner = await db.selectFrom("scenario_scenes",)
    .innerJoin("scenarios", "scenarios.id", "scenario_scenes.scenario_id",)
    .select("scenarios.owner_id",)
    .where("scenario_scenes.id", "=", source.scene_id,).executeTakeFirstOrThrow();

  if (owner.owner_id !== opts.ownerId) { throw new Error("IVSS retake source is not owned by caller",); }
  if (source.status !== FragmentStatus.Completed) {
    throw new Error(`IVSS retake source fragment ${source.id} is not completed`,);
  }

  if (!source.latent_asset_id) {
    throw new Error(`IVSS retake source fragment ${source.id} has no latent package`,);
  }

  const siblings = await db.selectFrom("scenario_fragments",).select("take",)
    .where("parent_fragment_id", "=", source.id,).execute();

  const nextTake = siblings.length === 0
    ? 1
    : Math.max(...siblings.map((row,) => Number.parseInt(row.take, 10,) || 0),) + 1;

  const take = String(nextTake,);
  const input = safeJsonStringify({
    latent: source.latent_asset_id,
    parent_fragment: source.id,
  },);

  if (!input.ok) { throw new Error("IVSS retake inputs could not be serialized",); }

  const id = randomUUID();
  await db.insertInto("scenario_fragments",).values({
    id,
    scene_id: source.scene_id,
    shot_id: source.shot_id,
    sort_order: source.sort_order,
    operation: source.operation,
    status: FragmentStatus.Planned,
    workflow_id: source.workflow_id,
    workflow_hash: source.workflow_hash,
    workflow_version: source.workflow_version,
    node_versions: source.node_versions,
    mode: source.mode,
    seed: source.seed,
    duration_frames: source.duration_frames,
    transition: source.transition,
    prompt_message_id: source.prompt_message_id,
    prompt_snapshot: source.prompt_snapshot,
    gallery_asset_id: source.gallery_asset_id,
    caption: source.caption,
    input_assets: input.value,
    output_asset_id: null,
    latent_asset_id: null,
    parent_fragment_id: source.id,
    take,
    cut_in_ms: source.cut_in_ms,
    cut_out_ms: source.cut_out_ms,
    error: null,
    created_at: timestamp(),
    updated_at: timestamp(),
  },).execute();

  return { fragmentId: id, parentFragmentId: source.id, take, latentAssetId: source.latent_asset_id, };
}

/**
 * Resolve the reusable latent of a fragment's declared parent.
 * @param opts - database, upload root, caller and the target fragment
 * @throws {Error} When lineage, workflow pin, ownership or the latent file is invalid
 * @returns asset id, local path and parent take label
 */
export async function resolveRetakeLatent(opts: {
  database: Kysely<DB>;
  uploadDir: string;
  ownerId: string;
  fragment: RetakeTargetFragment;
  resumeFromFragmentId: string;
},): Promise<RetakeLatent> {
  const parent = await opts.database.selectFrom("scenario_fragments",).selectAll()
    .where("id", "=", opts.resumeFromFragmentId,).executeTakeFirstOrThrow();

  if (parent.id !== opts.fragment.parent_fragment_id) {
    throw new Error("IVSS retake parent does not match fragment lineage",);
  }

  if (
    parent.workflow_id !== opts.fragment.workflow_id ||
    parent.workflow_hash !== opts.fragment.workflow_hash
  ) {
    throw new Error("IVSS retake parent workflow pin differs from target fragment",);
  }

  if (parent.status !== FragmentStatus.Completed || !parent.latent_asset_id) {
    throw new Error("IVSS retake parent has no completed latent package",);
  }

  const asset = await getOwnedAsset(opts.database, parent.latent_asset_id, opts.ownerId,);
  if (!asset) { throw new Error("IVSS retake latent asset is missing or not owned by caller",); }

  // ponytail: local filesystem path only; remote ComfyUI boxes need an asset URL contract.
  const path = getAssetFilePath(opts.uploadDir, asset.storage_path,);
  if (!existsSync(path,)) { throw new Error("IVSS retake latent file is missing on disk",); }

  return { assetId: asset.id, path, parentTake: parent.take, };
}
