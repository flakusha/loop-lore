// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { addChecksum, } from "./helpers";
import type { ExportContext, } from "./types";

/**
 * Export the user's assets into `zip/assets/` by copying their storage
 * files. Populates `ctx.counts.assets`.
 * @param ctx
 */
export async function exportAssetsToZip(ctx: ExportContext,): Promise<void> {
  const assets = await ctx.database
    .selectFrom("assets",)
    .selectAll()
    .where("owner_id", "=", ctx.userId,)
    .execute();

  const assetsFolder = ctx.zip.folder("assets",);
  for (const asset of assets) {
    if (!asset.storage_path) { continue; }
    const file = Bun.file(asset.storage_path,);
    if (!(await file.exists())) { continue; }
    const buffer = await file.arrayBuffer();
    const name = `${asset.id}-${asset.filename}`;
    assetsFolder?.file(name, buffer,);
    addChecksum(ctx.checksums, `assets/${name}`, Buffer.from(buffer,),);

    ctx.onItem?.({
      id: asset.id,
      type: "asset",
      name: asset.filename,
      format: asset.mime_type?.split("/", 2,)[1] ?? "unknown",
      filename: name,
      checksum: ctx.checksums[`assets/${name}`] ?? "",
      size: buffer.byteLength,
      metadata: {
        mime_type: asset.mime_type,
        asset_type: asset.asset_type,
      },
    },);
  }
  ctx.counts.assets = assets.length;
}
