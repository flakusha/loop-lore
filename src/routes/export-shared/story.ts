// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { addChecksum, prettyJson, } from "./helpers";
import type { ExportContext, WorldBundle, } from "./types";

/**
 * Build the round-trippable {@link WorldBundle} for one world: the world row
 * plus every story-domain record owned by it (locations, lore, quests, and
 * world/location states). Shared by the bulk ZIP story export and the
 * per-world export route so both produce identical bundles.
 * @param database
 * @param worldId
 */
export async function buildWorldBundle(database: Kysely<DB>, worldId: string,): Promise<WorldBundle | null> {
  const world = await database
    .selectFrom("worlds",)
    .selectAll()
    .where("id", "=", worldId,)
    .executeTakeFirst();
  if (!world) { return null; }

  const [locationsRes, loreEntriesRes, questsRes, worldStatesRes, locationStatesRes,] = await Promise.allSettled([
    database.selectFrom("locations",).selectAll().where("world_id", "=", worldId,).execute(),
    database.selectFrom("world_lore_entries",).selectAll().where("world_id", "=", worldId,).execute(),
    database.selectFrom("quests",).selectAll().where("world_id", "=", worldId,).execute(),
    database.selectFrom("world_states",).selectAll().where("world_id", "=", worldId,).execute(),
    database.selectFrom("location_states",).selectAll().where("world_id", "=", worldId,).execute(),
  ],);

  return {
    schema_version: "1.0",
    world,
    locations: locationsRes.status === "fulfilled" ? locationsRes.value : [],
    world_lore_entries: loreEntriesRes.status === "fulfilled" ? loreEntriesRes.value : [],
    quests: questsRes.status === "fulfilled" ? questsRes.value : [],
    world_states: worldStatesRes.status === "fulfilled" ? worldStatesRes.value : [],
    location_states: locationStatesRes.status === "fulfilled" ? locationStatesRes.value : [],
  };
}

/**
 * Export a self-contained {@link WorldBundle} per owned world into
 * `zip/story/<worldId>.json`. Populates `ctx.counts.story`.
 * @param ctx
 */
export async function exportStoryToZip(ctx: ExportContext,): Promise<void> {
  const worlds = await ctx.database
    .selectFrom("worlds",)
    .selectAll()
    .where("owner_id", "=", ctx.userId,)
    .execute();

  const storyFolder = ctx.zip.folder("story",);
  for (const world of worlds) {
    const bundle = await buildWorldBundle(ctx.database, world.id,);
    if (!bundle) { continue; }

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
        location_count: bundle.locations.length,
        quest_count: bundle.quests.length,
      },
    },);
  }
  ctx.counts.story = worlds.length;
}
