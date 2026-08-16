// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { addChecksum, prettyJson, } from "./helpers";
import type { ExportContext, } from "./types";

/**
 * Export the user's locations into `zip/locations/<worldId>/` as JSON.
 * Ownership is scoped through the owning world. Populates
 * `ctx.counts.locations`.
 */
export async function exportLocationsToZip(ctx: ExportContext,): Promise<void> {
  const locations = await ctx.database
    .selectFrom("locations",)
    .innerJoin("worlds", "worlds.id", "locations.world_id",)
    .selectAll("locations",)
    .where("worlds.owner_id", "=", ctx.userId,)
    .execute();

  const locationsFolder = ctx.zip.folder("locations",);
  for (const location of locations) {
    const worldFolder = locationsFolder?.folder(location.world_id,);
    const filename = `${location.id}.json`;
    const content = prettyJson(location,);
    const checksumPath = `locations/${location.world_id}/${filename}`;
    worldFolder?.file(filename, content,);
    addChecksum(ctx.checksums, checksumPath, content,);

    ctx.onItem?.({
      id: location.id,
      type: "location",
      name: location.name,
      format: "json",
      filename: `${location.world_id}/${filename}`,
      checksum: ctx.checksums[checksumPath] ?? "",
      size: content.length,
      metadata: { world_id: location.world_id, },
    },);
  }
  ctx.counts.locations = locations.length;
}
