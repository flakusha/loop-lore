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
import type { ChatKey, } from "../../crypto/chat-keys";
import type { PipelineConfig, } from "../../crypto/pipeline";
import type { DB, } from "../../db/schema";
import { createAsset, hashBuffer, } from "./create";
import { extensionForMime, } from "./detect";
import { linkAsset, } from "./links";
import type { AssetLinkInput, AssetRecord, } from "./types";

/** */
export interface PersistGeneratedImagesOpts {
  database: Kysely<DB>;
  uploadDir: string;
  images: Buffer[];
  mimeType: string;
  ownerId: string;
  /** Alt text, or a per-image builder (e.g. one that reads image metadata). */
  altText: string | ((index: number, buffer: Buffer,) => string);
  /** Entity links applied to every persisted asset (e.g. message + chat). */
  links: AssetLinkInput[];
  /**
   * Optional filename stem override per image. Defaults to the content hash,
   * so an identical re-run addresses the same bytes. Pass only when the caller
   * has a stronger identity than the raw bytes (e.g. an emotion label).
   */
  makeFilename?: (index: number,) => string;
  /** Encryption context — omit for public (plaintext) storage. */
  encryptionTier?: string;
  chatKey?: ChatKey | null;
  keyId?: string | null;
  pipelineConfig?: PipelineConfig;
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
  const ext = extensionForMime(opts.mimeType,);
  // Content-addressed by default: the filename stem is the SHA-256 of the
  // bytes and the same hash populates `content_hash`, so the unique index
  // collapses a byte-identical re-run onto the existing row (duplicate:true).
  // A caller that supplies `makeFilename` declares a stronger identity than
  // the raw bytes, so those rows keep `dedupe:false` and stay distinct.
  const contentAddressed = opts.makeFilename === undefined;
  const persisted: PersistedGeneratedImage[] = [];
  for (let index = 0; index < opts.images.length; index += 1) {
    const buffer = opts.images[index]!;
    const hash = hashBuffer(buffer,);
    const filename = contentAddressed ? `${hash}.${ext}` : opts.makeFilename!(index,);
    const altText = typeof opts.altText === "function" ? opts.altText(index, buffer,) : opts.altText;
    const { asset, duplicate, } = await createAsset({
      database: opts.database,
      input: {
        ownerId: opts.ownerId,
        filename,
        mimeType: opts.mimeType,
        assetType: "image",
        sizeBytes: buffer.length,
        buffer,
        altText,
        contentHash: contentAddressed ? hash : undefined,
        // `dedupe:false` is the explicit opt-out for callers that key on
        // something other than the bytes; the content-addressed path relies on
        // the hash instead.
        dedupe: contentAddressed ? undefined : false,
        encryptionTier: opts.encryptionTier,
        chatKey: opts.chatKey,
        keyId: opts.keyId,
        pipelineConfig: opts.pipelineConfig,
      },
      uploadDir: opts.uploadDir,
    },);

    for (const link of opts.links) {
      await linkAsset({
        database: opts.database,
        assetId: asset.id,
        link,
      },);
    }

    persisted.push({ asset, duplicate, },);
  }

  return persisted;
}
