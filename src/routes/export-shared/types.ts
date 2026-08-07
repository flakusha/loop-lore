import type JSZip from "jszip";
import type { Kysely, Selectable, } from "kysely";
import type {
  DB,
  Locations,
  LocationStates,
  Quests,
  WorldLoreEntries,
  Worlds,
  WorldStates,
} from "../../db/schema";

/**
 * Per-item export metadata, surfaced via the `onItem` sink. The SSE handler
 * collects these into its asset manifest; the plain handler ignores them.
 */
export interface ExportItem {
  id: string;
  type: "character" | "chat" | "world" | "location" | "story" | "asset";
  name: string;
  format: string;
  filename: string;
  checksum: string;
  size: number;
  metadata?: Record<string, unknown>;
}

/** Shared context threaded through every per-type export routine. */
export interface ExportContext {
  database: Kysely<DB>;
  userId: string;
  zip: JSZip;
  checksums: Record<string, string>;
  format: string;
  chatIds?: string[];
  counts: Record<string, number>;
  /** Optional per-item sink (SSE progress + asset manifest). */
  onItem?: (item: ExportItem,) => void;
}

export interface FinalizeExportInput {
  zip: JSZip;
  checksums: Record<string, string>;
  counts: Record<string, number>;
  userId: string;
  now: Date;
  format: string;
  include: string[];
  /** SSE-only: collected per-item manifest entries. */
  assetManifest?: ExportItem[];
}

/**
 * Canonical round-trippable world bundle: a world row plus every story-domain
 * record owned by that world. Produced by {@link exportStoryToZip} and consumed
 * by the world import route, so a single `story/<worldId>.json` file restores a
 * world, its locations, and its story state.
 */
export interface WorldBundle {
  schema_version: string;
  world: Selectable<Worlds>;
  locations: Selectable<Locations>[];
  world_lore_entries: Selectable<WorldLoreEntries>[];
  quests: Selectable<Quests>[];
  world_states: Selectable<WorldStates>[];
  location_states: Selectable<LocationStates>[];
}
