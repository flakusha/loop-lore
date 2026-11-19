// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Upload scenario references to ComfyUI before a fragment is submitted.
 *
 * A reference with `role === "mask"` is uploaded through `/upload/mask` and
 * overlays the most recently uploaded image in the same run; there is no
 * separate mask column yet. All uploads complete before submit, so a failed
 * upload never leaves a half-configured workflow in the queue.
 */
import type { Kysely, } from "kysely";
import { getAssetData, getOwnedAsset, } from "../../assets/service/read";
import type { DB, } from "../../db/schema";
import type { ComfyUIMaskOriginalRef, } from "../providers/comfyui-upload";

/** Upload seam satisfied by `ComfyUIClient` and by CI stubs. */
export interface IvssReferenceClient {
  uploadImage(buffer: Buffer, filename: string,): Promise<string>;
  uploadMask?(buffer: Buffer, filename: string, originalRef: ComfyUIMaskOriginalRef,): Promise<string>;
}

export interface IvssUploadedReference {
  lane: string;
  role: string | null;
  assetId: string;
  refId: string;
  /** Name ComfyUI stored the bytes under. */
  name: string;
  trimInMs: number | null;
  trimOutMs: number | null;
  stream: string | null;
}

export interface UploadIvssReferencesOptions {
  database: Kysely<DB>;
  uploadDir: string;
  ownerId: string;
  scenarioId: string;
  sceneId: string;
  shotId?: string | null;
  client: IvssReferenceClient;
}

/**
 * Upload the references visible to a fragment: scenario-wide, scene-scoped and
 * (when present) shot-scoped, in `sort_order`. Mask uploads need an earlier
 * image to overlay.
 * @param opts - database, identity and the injectable upload client
 * @returns slots passed to the workflow loader as `reference_slots`
 * @throws {Error} When a reference asset is missing, not owned or unreadable
 */
export async function uploadIvssReferences(
  opts: UploadIvssReferencesOptions,
): Promise<IvssUploadedReference[]> {
  const { database, uploadDir, ownerId, sceneId, shotId, client, } = opts;
  const rows = await database.selectFrom("scenario_references",).selectAll()
    .where("scenario_id", "=", opts.scenarioId,).orderBy("sort_order",).execute();

  const applicable = rows.filter((row,) =>
    row.scope === "scenario" ||
    (row.scope === "scene" && row.scene_id === sceneId) ||
    (row.scope === "shot" && shotId !== undefined && shotId !== null && row.shot_id === shotId)
  );

  const slots: IvssUploadedReference[] = [];
  let lastImage: string | undefined;
  for (const ref of applicable) {
    const asset = await getOwnedAsset(database, ref.asset_id, ownerId,);
    if (!asset) {
      throw new Error(`IVSS reference ${ref.id}: asset not found or not owned by the caller`,);
    }

    const buffer = await getAssetData(database, ref.asset_id, uploadDir,);
    if (!buffer) {
      throw new Error(`IVSS reference ${ref.id}: asset has no readable file`,);
    }

    const filename = `${ref.id}-${asset.filename}`;
    let name: string;
    if (ref.role === "mask") {
      if (!client.uploadMask || !lastImage) {
        throw new Error(`IVSS reference ${ref.id}: mask has no preceding image to overlay`,);
      }

      const original: ComfyUIMaskOriginalRef = { filename: lastImage, type: "input", };
      name = await client.uploadMask(buffer, filename, original,);
    } else {
      name = await client.uploadImage(buffer, filename,);
      lastImage = name;
    }

    slots.push({
      lane: ref.lane,
      role: ref.role,
      assetId: ref.asset_id,
      refId: ref.id,
      name,
      trimInMs: ref.trim_in_ms,
      trimOutMs: ref.trim_out_ms,
      stream: ref.stream,
    },);
  }

  return slots;
}
