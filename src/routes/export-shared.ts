/**
 * Shared bulk-export routines for the export routes.
 *
 * Both `routes/export.ts` (ZIP endpoint) and `routes/export-sse.ts` (SSE
 * progress endpoint) run the same per-type export pipelines — query rows,
 * write them into a JSZip folder, and record a checksum. This module hosts
 * that shared logic so the two handlers differ only in I/O: the SSE handler
 * wires an `onItem` notifier to drive its progress bar and the asset
 * manifest, while the plain handler passes none.
 *
 * @module routes/export-shared
 */

import JSZip from "jszip";
import type { Kysely, Selectable, } from "kysely";
import crypto from "node:crypto";
import { exportToCcV3Json, } from "../characters/exporters/ccv3";
import { exportToPng, } from "../characters/exporters/png";
import { exportToYaml, } from "../characters/exporters/yaml";
import type { CanonicalCharacter, } from "../characters/parser";
import { decryptMessageContent, getSmk, } from "../crypto";
import type {
  DB,
  Locations,
  LocationStates,
  Quests,
  WorldLoreEntries,
  Worlds,
  WorldStates,
} from "../db/schema";
import { jsonParseOr, } from "../utils";

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

/**
 * Record a `sha256:` prefixed checksum for a written export artifact.
 * Shared by both export handlers for routine, metadata, and manifest entries.
 */
export function addChecksum(
  checksums: Record<string, string>,
  path: string,
  content: string | Buffer,
): void {
  checksums[path] = `sha256:${crypto.createHash("sha256",).update(content,).digest("hex",)}`;
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
 * Write the export metadata (export-info, schema-version, optional
 * asset-manifest), the manifest (with checksums), regenerate the manifest
 * with final checksums, and produce the ZIP buffer.
 *
 * Shared by both export handlers; the SSE handler passes `assetManifest`,
 * the plain handler omits it.
 */
export async function finalizeExportZip(input: FinalizeExportInput,): Promise<Buffer> {
  const { zip, checksums, counts, userId, now, format, include, assetManifest, } = input;

  const exportInfo = {
    exported_at: now.toISOString(),
    exported_by: userId,
    format,
    includes: include,
    item_count: Object.values(counts,).reduce((a, b,) => a + b, 0,),
  };
  const schemaVersion = {
    schema_version: "1.0",
    export_format_version: "1.0",
  };

  const metadataFolder = zip.folder("metadata",);
  const exportInfoStr = JSON.stringify(exportInfo, null, 2,);
  metadataFolder?.file("export-info.json", exportInfoStr,);
  addChecksum(checksums, "metadata/export-info.json", exportInfoStr,);

  const schemaVersionStr = JSON.stringify(schemaVersion, null, 2,);
  metadataFolder?.file("schema-version.json", schemaVersionStr,);
  addChecksum(checksums, "metadata/schema-version.json", schemaVersionStr,);

  if (assetManifest) {
    const assetManifestStr = JSON.stringify(assetManifest, null, 2,);
    metadataFolder?.file("asset-manifest.json", assetManifestStr,);
    addChecksum(checksums, "metadata/asset-manifest.json", assetManifestStr,);
  }

  const manifestBase = {
    version: "1.0",
    exported_at: now.toISOString(),
    exported_by: userId,
    format_version: "1.0",
    contents: counts,
    checksums,
  };
  const manifest = assetManifest ? { ...manifestBase, asset_manifest: assetManifest, } : manifestBase;
  const manifestStr = JSON.stringify(manifest, null, 2,);
  zip.file("manifest.json", manifestStr,);
  addChecksum(checksums, "manifest.json", manifestStr,);

  // Regenerate ZIP with the final manifest (checksums updated)
  const finalManifest = assetManifest ? { ...manifestBase, asset_manifest: assetManifest, } : manifestBase;
  zip.file("manifest.json", JSON.stringify(finalManifest, null, 2,),);

  return zip.generateAsync({ type: "nodebuffer", },);
}

/**
 * Export the user's characters into `zip/characters/` in the requested format.
 * Populates `ctx.counts.characters`.
 */
export async function exportCharactersToZip(ctx: ExportContext,): Promise<void> {
  const characters = await ctx.database
    .selectFrom("actors",)
    .select([
      "id",
      "display_name",
      "description",
      "personality",
      "scenario",
      "system_prompt",
      "welcome_message",
      "mes_example",
      "post_history_instructions",
      "creator",
      "creator_notes",
      "character_version",
      "alternate_greetings",
    ],)
    .where("actor_type", "=", "character",)
    .where("user_id", "=", ctx.userId,)
    .execute();

  const charsFolder = ctx.zip.folder("characters",);
  for (const char of characters) {
    const canonical: CanonicalCharacter = {
      name: char.display_name,
      description: char.description ?? "",
      personality: char.personality ?? "",
      scenario: char.scenario ?? undefined,
      welcome_message: char.welcome_message ?? undefined,
      mes_example: char.mes_example ?? undefined,
      system_prompt: char.system_prompt ?? undefined,
      post_history_instructions: char.post_history_instructions ?? undefined,
      creator: char.creator ?? undefined,
      creator_notes: char.creator_notes ?? undefined,
      alternate_greetings: char.alternate_greetings ? jsonParseOr(char.alternate_greetings, [],) : undefined,
    };

    const filename = char.display_name.replaceAll(/[^a-z0-9]/gi, "_",).toLowerCase();
    let ext = "json";
    let size: number;
    if (ctx.format === "yaml") {
      const content = exportToYaml(canonical,);
      charsFolder?.file(`${filename}.yaml`, content,);
      addChecksum(ctx.checksums, `characters/${filename}.yaml`, content,);
      ext = "yaml";
      size = content.length;
    } else if (ctx.format === "png") {
      const pngBuf = exportToPng(canonical,);
      charsFolder?.file(`${filename}.png`, pngBuf,);
      addChecksum(ctx.checksums, `characters/${filename}.png`, pngBuf,);
      ext = "png";
      size = pngBuf.length;
    } else {
      const content = exportToCcV3Json(canonical,);
      charsFolder?.file(`${filename}.json`, content,);
      addChecksum(ctx.checksums, `characters/${filename}.json`, content,);
      size = content.length;
    }

    ctx.onItem?.({
      id: char.id,
      type: "character",
      name: char.display_name,
      format: ctx.format,
      filename: `${filename}.${ext}`,
      checksum: ctx.checksums[`characters/${filename}.${ext}`] ?? "",
      size,
    },);
  }
  ctx.counts.characters = characters.length;
}

/**
 * Export the user's chats (optionally filtered by chat ids) into
 * `zip/chats/` as JSON. Populates `ctx.counts.chats`.
 */
export async function exportChatsToZip(ctx: ExportContext,): Promise<void> {
  let query = ctx.database
    .selectFrom("chats",)
    .select(["id", "name", "type", "mode", "created_at",],)
    .where("created_by", "=", ctx.userId,);

  if (ctx.chatIds && ctx.chatIds.length > 0) {
    query = query.where("id", "in", ctx.chatIds,);
  }

  const chats = await query.execute();
  const chatsFolder = ctx.zip.folder("chats",);

  for (const chat of chats) {
    const rows = await ctx.database
      .selectFrom("messages",)
      .innerJoin("actors", "actors.id", "messages.actor_id",)
      .select([
        "messages.id",
        "messages.chat_id",
        "messages.content",
        "messages.content_encoding",
        "messages.key_id",
        "messages.role",
        "messages.created_at",
        "actors.display_name",
      ],)
      .where("messages.chat_id", "=", chat.id,)
      .orderBy("messages.created_at", "asc",)
      .execute();

    // Decrypt encrypted message bodies so the ZIP export carries plaintext,
    // never the raw ciphertext (a data leak).
    const smk = getSmk();
    const messages: {
      id: string;
      role: string;
      author: string | null;
      content: string;
      created_at: string | Date;
    }[] = [];
    for (const row of rows) {
      const content = row.key_id && smk
        ? await decryptMessageContent(ctx.database, row, smk,)
        : row.content;
      messages.push({
        id: row.id,
        role: row.role,
        author: row.display_name,
        content,
        created_at: row.created_at,
      },);
    }

    const chatData = {
      id: chat.id,
      name: chat.name,
      type: chat.type,
      mode: chat.mode,
      created_at: chat.created_at,
      messages,
    };

    const filename = (chat.name ?? chat.id).replaceAll(/[^a-z0-9]/gi, "_",).toLowerCase();
    const content = JSON.stringify(chatData, null, 2,);
    chatsFolder?.file(`${filename}.json`, content,);
    addChecksum(ctx.checksums, `chats/${filename}.json`, content,);

    ctx.onItem?.({
      id: chat.id,
      type: "chat",
      name: chat.name ?? chat.id,
      format: "json",
      filename: `${filename}.json`,
      checksum: ctx.checksums[`chats/${filename}.json`] ?? "",
      size: content.length,
      metadata: {
        message_count: messages.length,
        chat_type: chat.type,
        chat_mode: chat.mode,
      },
    },);
  }
  ctx.counts.chats = chats.length;
}

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
    const content = JSON.stringify(world, null, 2,);
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

/**
 * Export the user's assets into `zip/assets/` by copying their storage
 * files. Populates `ctx.counts.assets`.
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
    const content = JSON.stringify(location, null, 2,);
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
    const [locations, loreEntries, quests, worldStates, locationStates,] = await Promise.all([
      ctx.database.selectFrom("locations",).selectAll().where("world_id", "=", world.id,).execute(),
      ctx.database.selectFrom("world_lore_entries",).selectAll().where("world_id", "=", world.id,).execute(),
      ctx.database.selectFrom("quests",).selectAll().where("world_id", "=", world.id,).execute(),
      ctx.database.selectFrom("world_states",).selectAll().where("world_id", "=", world.id,).execute(),
      ctx.database.selectFrom("location_states",).selectAll().where("world_id", "=", world.id,).execute(),
    ],);

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
    const content = JSON.stringify(bundle, null, 2,);
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
