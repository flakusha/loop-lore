// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { addChecksum, prettyJson, } from "./helpers";
import type { ExportContext, WorldBundle, } from "./types";

/**
 * Export a self-contained {@link WorldBundle} per owned world into
 * `zip/story/<worldId>.json`. Populates `ctx.counts.story`.
 */
export async function exportStoryToZip(ctx: ExportContext,): Promise<void> {
  const worlds = await ctx.database
    .selectFrom("worlds",)
    .selectAll()
    .where("owner_id", "=", ctx.userId,)
    .execute();

  const storyFolder = ctx.zip.folder("story",);
  for (const world of worlds) {
    const [locationsRes, loreEntriesRes, questsRes, worldStatesRes, locationStatesRes,] = await Promise.allSettled([
      ctx.database.selectFrom("locations",).selectAll().where("world_id", "=", world.id,).execute(),
      ctx.database.selectFrom("world_lore_entries",).selectAll().where("world_id", "=", world.id,).execute(),
      ctx.database.selectFrom("quests",).selectAll().where("world_id", "=", world.id,).execute(),
      ctx.database.selectFrom("world_states",).selectAll().where("world_id", "=", world.id,).execute(),
      ctx.database.selectFrom("location_states",).selectAll().where("world_id", "=", world.id,).execute(),
    ],);
    const locations = locationsRes.status === "fulfilled" ? locationsRes.value : [];
    const loreEntries = loreEntriesRes.status === "fulfilled" ? loreEntriesRes.value : [];
    const quests = questsRes.status === "fulfilled" ? questsRes.value : [];
    const worldStates = worldStatesRes.status === "fulfilled" ? worldStatesRes.value : [];
    const locationStates = locationStatesRes.status === "fulfilled" ? locationStatesRes.value : [];

    const bundle: WorldBundle = {
      schema_version: "1.0",
      world,
      locations,
      world_lore_entries: loreEntries,
      quests,
      world_states: worldStates,
      location_states: locationStates,
    };

    const filename = `${world.id}.json`;
    const content = prettyJson(bundle,);
    const checksumPath = `story/${filename}`;
    storyFolder?.file(filename, content,);
    addChecksum(ctx.checksums, checksumPath, content,);

    ctx.onItem?.({
      id: world.id,
      type: "story",
      name: world.name ?? world.id,
      format: "json",
      filename,
      checksum: ctx.checksums[checksumPath] ?? "",
      size: content.length,
      metadata: {
        world_id: world.id,
        location_count: locations.length,
        quest_count: quests.length,
      },
    },);
  }
  ctx.counts.story = worlds.length;
}
