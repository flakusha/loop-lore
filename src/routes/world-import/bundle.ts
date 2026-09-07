// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Insertable, Kysely, } from "kysely";
import {
  DifficultyReroll,
  DifficultyState,
  LoreEntryStatus,
  LorePosition,
  PublicationStatus,
  QuestStatus,
  QuestType,
  WorldKind,
  WorldVisibility,
} from "../../db/enums-story";
import type { DB, Locations, LocationStates, Quests, WorldLoreEntries, Worlds, WorldStates, } from "../../db/schema";
import { uid, } from "../../utils";
import type { WorldBundle, } from "../export-shared";
import { num, rowOf, rowsOf, str, strOrNull, } from "./rows";
import type { ImportCounts, } from "./types";

/**
 * Re-insert a {@link WorldBundle} as a new world owned by `userId`.
 * Generates fresh ids for every row and remaps parent/child foreign keys so
 * the bundle round-trips without colliding with existing rows.
 * @param database
 * @param userId
 * @param bundle
 * @returns the new world id and per-table import counts.
 */
export async function importWorldBundle(
  database: Kysely<DB>,
  userId: string,
  bundle: WorldBundle,
): Promise<{ worldId: string; counts: ImportCounts }> {
  return database.transaction().execute(async (trx,) => {
    const worldId = uid();
    const counts: ImportCounts = {
      world: 1,
      locations: 0,
      world_lore_entries: 0,
      quests: 0,
      world_states: 0,
      location_states: 0,
    };

    const world = rowOf(bundle.world,);
    const worldValues: Insertable<Worlds> = {
      id: worldId,
      owner_id: userId,
      name: str(world ?? {}, "name",) ?? "Imported World",
      description: strOrNull(world ?? {}, "description",),
      lore: strOrNull(world ?? {}, "lore",),
      publication_status: (world?.publication_status as PublicationStatus) ?? PublicationStatus.Draft,
      kind: (world?.kind as WorldKind) ?? WorldKind.Rpg,
      visibility: (world?.visibility as WorldVisibility) ?? WorldVisibility.Private,
      scan_depth: num(world ?? {}, "scan_depth",) ?? 100,
      token_budget: num(world ?? {}, "token_budget",) ?? 2000,
      difficulty_modifier: num(world ?? {}, "difficulty_modifier",) ?? 1,
      difficulty_reroll: (world?.difficulty_reroll as DifficultyReroll) ?? DifficultyReroll.None,
      difficulty_state: (world?.difficulty_state as DifficultyState) ?? DifficultyState.Normal,
      nsfw_override: strOrNull(world ?? {}, "nsfw_override",),
    };
    await trx.insertInto("worlds",).values(worldValues,).execute();

    // ── locations ───────────────────────────────────────────────
    // Pre-assign new ids so parent references can be mapped regardless of the
    // order locations appear in the bundle. Insert with a null parent first to
    // avoid FK ordering issues, then backfill parents in a second pass.
    const locationRows = rowsOf(bundle.locations,);
    const locationIdMap = new Map<string, string>();
    const locationValues: Insertable<Locations>[] = [];
    for (const row of locationRows) {
      const oldId = str(row, "id",);
      const newId = uid();
      if (oldId) { locationIdMap.set(oldId, newId,); }
      locationValues.push({
        id: newId,
        world_id: worldId,
        name: str(row, "name",) ?? "Unnamed Location",
        description: strOrNull(row, "description",),
        publication_status: (row.publication_status as PublicationStatus) ?? PublicationStatus.Draft,
        parent_location_id: null,
        connections: str(row, "connections",) ?? "[]",
      },);
    }
    if (locationValues.length > 0) {
      await trx.insertInto("locations",).values(locationValues,).execute();
    }
    counts.locations = locationValues.length;

    for (const row of locationRows) {
      const oldParent = str(row, "parent_location_id",);
      if (!oldParent) { continue; }
      const newParent = locationIdMap.get(oldParent,);
      const oldId = str(row, "id",);
      const newId = oldId ? locationIdMap.get(oldId,) : undefined;
      if (newParent && newId) {
        await trx
          .updateTable("locations",)
          .set({ parent_location_id: newParent, },)
          .where("id", "=", newId,)
          .execute();
      }
    }

    // ── world_lore_entries ─────────────────────────────────────
    for (const row of rowsOf(bundle.world_lore_entries,)) {
      await trx.insertInto("world_lore_entries",).values(
        {
          id: uid(),
          world_id: worldId,
          name: strOrNull(row, "name",),
          content: str(row, "content",) ?? "",
          keys: str(row, "keys",) ?? "[]",
          secondary_keys: strOrNull(row, "secondary_keys",),
          selective: num(row, "selective",) ?? 0,
          case_sensitive: num(row, "case_sensitive",) ?? 0,
          enabled: (row.enabled as LoreEntryStatus) ?? LoreEntryStatus.Enabled,
          constant: num(row, "constant",) ?? 0,
          position: (row.position as LorePosition) ?? LorePosition.InChar,
          insertion_order: num(row, "insertion_order",) ?? 0,
          priority: num(row, "priority",) ?? 0,
          comment: strOrNull(row, "comment",),
          sort_order: num(row, "sort_order",) ?? 0,
          cooldown_seconds: num(row, "cooldown_seconds",) ?? 0,
          last_activated: strOrNull(row, "last_activated",),
          audience_scope: strOrNull(row, "audience_scope",),
        } satisfies Insertable<WorldLoreEntries>,
      ).execute();
      counts.world_lore_entries++;
    }

    // ── quests + quest_progress ────────────────────────────────
    const questRows = rowsOf(bundle.quests,);
    for (const row of questRows) {
      const newId = uid();
      await trx.insertInto("quests",).values(
        {
          id: newId,
          world_id: worldId,
          creator_id: userId,
          name: str(row, "name",) ?? "Quest",
          description: strOrNull(row, "description",),
          type: (row.type as QuestType) ?? QuestType.Discovery,
          status: (row.status as QuestStatus) ?? QuestStatus.Active,
          priority: num(row, "priority",) ?? 0,
          config: str(row, "config",) ?? "{}",
          progress: num(row, "progress",) ?? 0,
          target: num(row, "target",) ?? 1,
          start_time: strOrNull(row, "start_time",),
          deadline: strOrNull(row, "deadline",),
          time_location_id: strOrNull(row, "time_location_id",),
          rewards: str(row, "rewards",) ?? "[]",
          narrative_hooks: str(row, "narrative_hooks",) ?? "[]",
          completed_at: strOrNull(row, "completed_at",),
        } satisfies Insertable<Quests>,
      ).execute();
      counts.quests++;
    }

    // ── world_states ───────────────────────────────────────────
    for (const row of rowsOf(bundle.world_states,)) {
      await trx.insertInto("world_states",).values(
        {
          id: uid(),
          world_id: worldId,
          snapshot: str(row, "snapshot",) ?? "{}",
          trigger_message_id: null,
          trigger_turn_id: null,
          description: strOrNull(row, "description",),
        } satisfies Insertable<WorldStates>,
      ).execute();
      counts.world_states++;
    }

    // ── location_states ────────────────────────────────────────
    for (const row of rowsOf(bundle.location_states,)) {
      const locOld = str(row, "location_id",);
      const locNew = locOld ? locationIdMap.get(locOld,) : undefined;
      if (!locNew) { continue; } // orphaned state without a location
      await trx.insertInto("location_states",).values(
        {
          id: uid(),
          location_id: locNew,
          world_id: worldId,
          description_override: strOrNull(row, "description_override",),
          atmosphere: strOrNull(row, "atmosphere",),
          npcs_present: str(row, "npcs_present",) ?? "[]",
          items_available: str(row, "items_available",) ?? "[]",
          time_of_day: strOrNull(row, "time_of_day",),
          weather: strOrNull(row, "weather",),
          hazards: str(row, "hazards",) ?? "[]",
        } satisfies Insertable<LocationStates>,
      ).execute();
      counts.location_states++;
    }

    return { worldId, counts, };
  },);
}
