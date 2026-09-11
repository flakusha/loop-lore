// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Service — persist generated images
 *
 * Contract between the generation pipeline and asset persistence: buffers
 * from `generateImages` become asset rows, each linked to an entity so the
 * gallery surfaces them. Callers keep ownership of follow-ups (avatar rows,
 * matting jobs, review gates).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createAsset, } from "./create";
import { linkAsset, } from "./links";
import type { AssetLinkInput, AssetRecord, } from "./types";

/** */
export interface PersistGeneratedImagesOpts {
  database: Kysely<DB>;
  uploadDir: string;
  images: Buffer[];
  mimeType: string;
  ownerId: string;
  altText: string;
  link: AssetLinkInput;
  makeFilename(index: number,): string;
}

/** */
export interface PersistedGeneratedImage {
  asset: AssetRecord;
  duplicate: boolean;
}

/**
 * Persist generated image buffers as assets and link each to an entity.
 * Writes run sequentially — sqlite serializes them anyway, and per-index
 * attribution stays exact.
 * @param opts
 * @returns The persisted assets in input order.
 * @throws Propagates createAsset/linkAsset failures; earlier images stay persisted.
 */
export async function persistGeneratedImages(
  opts: PersistGeneratedImagesOpts,
): Promise<PersistedGeneratedImage[]> {
  const persisted: PersistedGeneratedImage[] = [];
  for (let index = 0; index < opts.images.length; index += 1) {
    const buffer = opts.images[index]!;
    const { asset, duplicate, } = await createAsset({
      database: opts.database,
      input: {
        ownerId: opts.ownerId,
        filename: opts.makeFilename(index,),
        mimeType: opts.mimeType,
        assetType: "image",
        sizeBytes: buffer.length,
        buffer,
        altText: opts.altText,
      },
      uploadDir: opts.uploadDir,
    },);
    await linkAsset({
      database: opts.database,
      assetId: asset.id,
      link: opts.link,
    },);
    persisted.push({ asset, duplicate, },);
  }
  return persisted;
}
