// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Service — 256px WebP thumbnail generation on upload.
 *
 * `generateThumbnail` resizes an image buffer to a max dimension of 256px
 * (preserving aspect ratio) and re-encodes as WebP quality 85, matching the
 * spec at `docs/spec/assets.md` line 86. The caller writes the returned
 * buffer to `${assetId}_thumb.webp` under the `compressed/` directory and
 * stores the relative path in `assets.thumbnail_path`.
 *
 * Thumbnail generation is best-effort: a sharp decode/encode failure leaves
 * the original asset untouched and the row's `thumbnail_path` null. The
 * serve path (`handleServeCompressed`) falls back to the raw bytes when
 * `thumbnail_path` is null, so a missing thumb never breaks the request.
 */
import { mkdirSync, writeFileSync, } from "node:fs";
import { dirname, join, } from "node:path";
import sharp, {} from "sharp";
import { resolveUploadDir, } from "./file-system";

/** Maximum thumbnail dimension (longest edge), per spec assets.md line 86. */
export const THUMBNAIL_MAX_DIM = 256;

/** WebP quality for the thumbnail encoder. */
export const THUMBNAIL_WEBP_QUALITY = 85;

/**
 * Resize an image buffer to a 256px-max WebP.
 * @param buffer - Source image bytes (PNG/JPEG/WebP/GIF, anything sharp reads).
 * @returns WebP-encoded thumbnail bytes.
 * @throws Error when sharp cannot decode/encode the input.
 */
export async function encodeThumbnail(buffer: Buffer,): Promise<Buffer> {
  return await sharp(buffer,)
    .resize(THUMBNAIL_MAX_DIM, THUMBNAIL_MAX_DIM, { fit: "inside", },)
    .webp({ quality: THUMBNAIL_WEBP_QUALITY, },)
    .toBuffer();
}

/**
 * Encode a thumbnail and write it to disk under
 * `compressed/${subDir}/${assetId}_thumb.webp`. Returns the relative
 * storage path on success, or null on decode/encode failure (callers
 * persist null and the serve path falls back to raw).
 * @param uploadDir - Configured upload root.
 * @param assetId - Asset identifier (used for the sub-directory layout).
 * @param buffer - Source image bytes.
 * @returns Relative storage path (e.g. `compressed/ab/cd/assetId_thumb.webp`),
 * or null when sharp could not decode the input.
 */
export async function writeThumbnail(
  uploadDir: string,
  assetId: string,
  buffer: Buffer,
): Promise<string | null> {
  let encoded: Buffer;
  try {
    encoded = await encodeThumbnail(buffer,);
  } catch {
    return null;
  }
  const subDir = `${assetId.slice(0, 2,)}/${assetId.slice(2, 4,)}`;
  const relativePath = `compressed/${subDir}/${assetId}_thumb.webp`;
  const absolutePath = join(resolveUploadDir(uploadDir,), relativePath,);
  mkdirSync(dirname(absolutePath,), { recursive: true, },);
  writeFileSync(absolutePath, encoded,);
  return relativePath;
}
