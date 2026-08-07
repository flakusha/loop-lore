// src/routes/world-import.ts
//
// World/location/story import route.
// Consumes the canonical WorldBundle produced by the story export
// (src/routes/export-shared.ts `exportStoryToZip`) and re-inserts a fresh
// world owned by the importing user, remapping identifiers so the bundle
// round-trips.

import { Elysia, } from "elysia";
import type { Insertable, Kysely, } from "kysely";
import type { AuthConfig, } from "../config/schema";
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
} from "../db/enums-story";
import type { DB, 
  Locations,
  LocationStates,
  Quests,
  WorldLoreEntries,
  Worlds,
  WorldStates} from "../db/schema";
import { authenticate, } from "../middleware/auth";
import { uid, } from "../utils";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import type { WorldBundle, } from "./export-shared";
import { HttpStatus, jsonCreated, jsonError, } from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
  config: { auth: AuthConfig };
}

type Row = Record<string, unknown>;

function rowsOf(value: unknown,): Row[] {
  if (!Array.isArray(value,)) { return []; }
  return value.filter((v,) => v && typeof v === "object") as Row[];
}

function rowOf(value: unknown,): Row | null {
  if (value && typeof value === "object") { return value as Row; }
  return null;
}

function str(row: Row, key: string,): string | undefined {
  const v = row[key];
  return typeof v === "string" ? v : undefined;
}

function strOrNull(row: Row, key: string,): string | null {
  const v = row[key];
  return typeof v === "string" || v === null ? v : null;
}

function num(row: Row, key: string,): number | undefined {
  const v = row[key];
  return typeof v === "number" ? v : undefined;
}

interface ImportCounts {
  world: number;
  locations: number;
  world_lore_entries: number;
  quests: number;
  world_states: number;
  location_states: number;
}

/**
 * Re-insert a {@link WorldBundle} as a new world owned by `userId`.
 * Generates fresh ids for every row and remaps parent/child foreign keys so
 * the bundle round-trips without colliding with existing rows.
 *
 * @returns the new world id and per-table import counts.
 */
export async function importWorldBundle(
  database: Kysely<DB>,
  userId: string,
  bundle: WorldBundle,
): Promise<{ worldId: string; counts: ImportCounts }> {
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
  await database.insertInto("worlds",).values(worldValues,).execute();

  // ── locations ───────────────────────────────────────────────
  // Pre-assign new ids so parent references can be mapped regardless of the
  // order locations appear in the bundle. Insert with a null parent first to
  // avoid FK ordering issues, then backfill parents in a second pass.
  const locationRows = rowsOf(bundle.locations,);
  const locationIdMap = new Map<string, string>();
  const locationValues: Insertable<Locations>[] = locationRows.map((row,) => {
    const oldId = str(row, "id",);
    const newId = uid();
    if (oldId) { locationIdMap.set(oldId, newId,); }
    return {
      id: newId,
      world_id: worldId,
      name: str(row, "name",) ?? "Unnamed Location",
      description: strOrNull(row, "description",),
      publication_status: (row.publication_status as PublicationStatus) ?? PublicationStatus.Draft,
      parent_location_id: null,
      connections: str(row, "connections",) ?? "[]",
    };
  },);
  if (locationValues.length > 0) {
    await database.insertInto("locations",).values(locationValues,).execute();
  }
  counts.locations = locationValues.length;

  for (const row of locationRows) {
    const oldParent = str(row, "parent_location_id",);
    if (!oldParent) { continue; }
    const newParent = locationIdMap.get(oldParent,);
    const oldId = str(row, "id",);
    const newId = oldId ? locationIdMap.get(oldId,) : undefined;
    if (newParent && newId) {
      await database
        .updateTable("locations",)
        .set({ parent_location_id: newParent, },)
        .where("id", "=", newId,)
        .execute();
    }
  }

  // ── world_lore_entries ─────────────────────────────────────
  for (const row of rowsOf(bundle.world_lore_entries,)) {
    await database.insertInto("world_lore_entries",).values(
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
    await database.insertInto("quests",).values(
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
    await database.insertInto("world_states",).values(
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
    await database.insertInto("location_states",).values(
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
}

export function worldImportRoutes({ database, config, }: HandlerOpts,): Elysia {
  return new Elysia({ name: "world-import", },).post("/api/import/world", async (ctx: any,) => {
    const authResult = await authenticate({ request: ctx.request, database, authConfig: config.auth, },);
    if (authResult instanceof Response) { return authResult; }
    const userId = authResult.context.userId;
    if (!userId) {
      return jsonError({
        message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
        status: HttpStatus.Unauthorized,
      },);
    }

    let body: unknown;
    try {
      body = await ctx.request.json();
    } catch {
      return jsonError({ message: "Invalid JSON body", status: HttpStatus.BadRequest, },);
    }

    const bundle = rowOf(body,);
    if (!bundle || !rowOf(bundle.world,)) {
      return jsonError({
        message: "A valid world bundle with a `world` object is required",
        status: HttpStatus.BadRequest,
      },);
    }

    const { worldId, counts, } = await importWorldBundle(database, userId, body as WorldBundle,);
    return jsonCreated({ id: worldId, imported: counts, },);
  }, {
    response: {
      200: SuccessResponse,
      201: SuccessResponse,
      400: ErrorResponse,
      401: ErrorResponse,
    },
    detail: {
      summary: "Import a world bundle",
      description:
        "Create a new world plus its locations and story state from a single WorldBundle JSON (as produced by the story export).",
      tags: ["Import",],
    },
  },) as unknown as Elysia;
}
