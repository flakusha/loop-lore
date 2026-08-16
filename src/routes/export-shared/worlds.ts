// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { addChecksum, prettyJson, } from "./helpers";
import type { ExportContext, } from "./types";

/**
 * Export the user's worlds into `zip/worlds/` as JSON.
 * Populates `ctx.counts.worlds`.
 */
export async function exportWorldsToZip(ctx: ExportContext,): Promise<void> {
  const worlds = await ctx.database
    .selectFrom("worlds",)
    .selectAll()
    .where("owner_id", "=", ctx.userId,)
    .execute();

  const worldsFolder = ctx.zip.folder("worlds",);
  for (const world of worlds) {
    const content = prettyJson(world,);
    worldsFolder?.file(`${world.id}.json`, content,);
    addChecksum(ctx.checksums, `worlds/${world.id}.json`, content,);

    ctx.onItem?.({
      id: world.id,
      type: "world",
      name: world.name ?? world.id,
      format: "json",
      filename: `${world.id}.json`,
      checksum: ctx.checksums[`worlds/${world.id}.json`] ?? "",
      size: content.length,
    },);
  }
  ctx.counts.worlds = worlds.length;
}
