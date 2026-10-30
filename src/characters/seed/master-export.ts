// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/seed/master-export.ts — Avatar Dogfood slice 2 export op
//
// Renders a promoted (lossless-webp) avatar master to png/jpg bytes on
// demand — the download / seeding-fallback path for readers without webp
// support. Kept beside the promote op (the only writer of these masters) so
// the master format and its export stay one contract, not two.

import sharp from "sharp";

/** RIFF container header: bytes 0-3 "RIFF", bytes 8-11 "WEBP". */
function isWebp(bytes: Buffer,): boolean {
  return bytes.length >= 12 &&
    bytes.subarray(0, 4,).toString("ascii",) === "RIFF" &&
    bytes.subarray(8, 12,).toString("ascii",) === "WEBP";
}

/** Export formats the op renders to. */
export type AvatarMasterExportFormat = "png" | "jpg";

/** Options for {@link exportAvatarMaster}. */
export interface ExportAvatarMasterOpts {
  /** Promoted master bytes (webp). */
  bytes: Buffer;
  /** Target raster format. */
  format: AvatarMasterExportFormat;
}

/**
 * Render a promoted webp avatar master to png or jpg bytes.
 * Full size, no resize — the export is a format conversion, not a
 * re-sampling. jpg output is lossy by definition (sharp defaults); png is
 * lossless, so a png export of a lossless master is pixel-exact.
 * @param opts Master bytes + target format.
 * @returns The rendered image bytes.
 * @throws {Error} When the input is not a webp master or sharp cannot
 *   decode/encode it.
 */
export async function exportAvatarMaster(opts: ExportAvatarMasterOpts,): Promise<Buffer> {
  if (!isWebp(opts.bytes,)) {
    throw new Error("exportAvatarMaster: input must be a webp master (promote output)",);
  }

  return opts.format === "png"
    ? await sharp(opts.bytes,).png({},).toBuffer()
    : await sharp(opts.bytes,).jpeg({},).toBuffer();
}
