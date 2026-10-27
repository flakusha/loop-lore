// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `/import` — import a character card from an uploaded file — and `/add` —
 * create a new location/item in an existing world (epic batch B4).
 *
 * `/import` reuses the EXISTING import infrastructure: the card parser
 * (`parseCharacterCard`, PNG/JSON/YAML/TOML/CHARX) and the card validator
 * (`validateCharacter`) from `src/characters/parser.ts`, and the frontend
 * confirm posts the file to the EXISTING import route
 * (`POST /api/v1/actors/import`, `src/routes/import/`).
 *
 * Both commands are preview-only: the file is parsed and validated, and the
 * preview action is confirmed by the user before anything is persisted.
 */

import type { Kysely, } from "kysely";
import { getAssetData, getOwnedAsset, } from "../../assets/service";
import type { AssetRecord, } from "../../assets/service";
import { parseCharacterCard, validateCharacter, } from "../../characters/parser";
import { ChatParticipantRole, ItemCategory, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { quotaGate, } from "../quota/gate";
import { requireOwnedWorld, } from "./entity-guard";
import { formatPatch, parseEntityPatch, } from "./entity-patch";
import { ITEM_ADD_SPEC, LOCATION_ADD_SPEC, } from "./entity-patch-spec";
import { type CommandResult, registerCommand, } from "./registry";

const NO_DB = (what: string,): CommandResult => ({
  systemMessage: `**${what} unavailable:** command context missing database.`,
  handled: true,
});

const ENTITY_KINDS = ["location", "item",] as const;

// ── /import character <asset-id|filename> ────────────────────

/**
 * Resolve the file to import: an asset id, or the file name of an asset the
 * caller uploaded.
 * @param db - database handle
 * @param ref - asset id or file name
 * @param ownerId - the authenticated caller (assets are owner-scoped)
 * @returns the asset, or null when the caller has no such file
 */
async function resolveImportAsset(
  db: Kysely<DB>,
  ref: string,
  ownerId: string,
): Promise<AssetRecord | null> {
  const direct = await getOwnedAsset(db, ref, ownerId,);
  if (direct) { return direct; }

  const byName = await db
    .selectFrom("assets",)
    .select("id",)
    .where("owner_id", "=", ownerId,)
    .where("filename", "=", ref,)
    .executeTakeFirst();

  if (!byName) { return null; }
  return await getOwnedAsset(db, byName.id, ownerId,);
}

registerCommand("import", async (args, ctx,): Promise<CommandResult> => {
  const quota = quotaGate(ctx.userId ?? null, "import",);
  if (quota) { return quota; }

  const [kindArg, fileRef,] = args;
  if (!kindArg || !fileRef) {
    return { systemMessage: "Usage: /import character <asset-id|filename>", handled: true, };
  }

  if (kindArg.toLowerCase() !== "character") {
    return {
      systemMessage: `Unknown entity kind "${kindArg}" — /import supports: character.`,
      handled: true,
    };
  }

  const db = ctx.db;
  if (!db) { return NO_DB("Character imports",); }

  const asset = await resolveImportAsset(db, fileRef, ctx.userId ?? "",);
  if (!asset) {
    return {
      systemMessage:
        `No uploaded file "${fileRef}" found in your assets — upload the character card to the chat first.`,
      handled: true,
    };
  }

  const uploadDir = ctx.config?.assets?.uploadDir;
  if (!uploadDir) {
    return {
      systemMessage: "**Import unavailable:** assets are not configured (no upload directory).",
      handled: true,
    };
  }

  let bytes: Buffer | null;
  try {
    bytes = await getAssetData(db, asset.id, uploadDir,);
  } catch {
    // Encrypted assets need the chat key, which the command context does not
    // carry — say so instead of failing with a decryption error.
    return {
      systemMessage: "**Import unavailable:** the file is stored encrypted — decrypt it before importing.",
      handled: true,
    };
  }

  if (!bytes) {
    return { systemMessage: "**Import failed:** the uploaded file could not be read.", handled: true, };
  }

  const filename = asset.filename ?? fileRef;
  let card;
  try {
    card = await parseCharacterCard(bytes, filename,);
  } catch (error) {
    return {
      systemMessage: `**Import rejected:** ${
        error instanceof Error ? error.message : "the file is not a readable character card"
      }.`,
      handled: true,
    };
  }

  const errors = validateCharacter(card.character,);
  if (errors.length > 0) {
    return { systemMessage: `**Import rejected:** ${errors.join(" ",)}`, handled: true, };
  }

  const warnings = [...card.warnings,];
  return {
    systemMessage: [
      `**Import preview** — **${card.character.name}** from **${filename}** (${card.format}).`,
      warnings.length > 0 ? `**Warnings:**\n${warnings.map((w,) => `- ${w}`).join("\n",)}` : "",
      "Confirm in the dialog to import the character.",
    ].filter(Boolean,).join("\n\n",),
    action: "import-entity",
    actionPayload: {
      assetId: asset.id,
      filename,
      name: card.character.name,
      format: card.format,
      warnings,
    },
    handled: true,
  };
}, { requiredRole: ChatParticipantRole.Member, },);

// ── /add <kind> <name> [world] [extras] ──────────────────────

registerCommand("add", async (args, ctx,): Promise<CommandResult> => {
  const kind = (args[0] || "") as (typeof ENTITY_KINDS)[number];
  const name = args[1] || "";
  if (!kind || !name) {
    return {
      systemMessage: 'Usage: /add <location|item> <name> [world-id] description="…" …',
      handled: true,
    };
  }

  if (!ENTITY_KINDS.includes(kind,)) {
    return {
      systemMessage: `Unknown entity kind "${kind}" — /add supports: ${ENTITY_KINDS.join(", ",)}.`,
      handled: true,
    };
  }

  // `args[2]` is the optional world id only when it is not a `key=value`
  // extra: `/add item Sword w-1 value=25` and `/add item Sword value=25`
  // (chat's world) must both resolve. World ids never contain "=".
  const worldArg = args[2] !== undefined && !args[2].includes("=",) ? args[2] : undefined;
  const worldId = worldArg ?? ctx.activeChat?.worldId;
  if (!worldId) {
    return {
      systemMessage: `Usage: /add ${kind} ${name} <world-id> — pass a world-id when the chat has no world.`,
      handled: true,
    };
  }

  const db = ctx.db;
  if (!db) {
    return NO_DB(kind === "location" ? "Locations" : "Items",);
  }

  // Same guards the create routes apply: `handleCreateLocation` uses
  // `requireWorldOwner`, the item-definitions POST route uses
  // `checkWorldOwnership`.
  const owned = await requireOwnedWorld(db, worldId, kind, ctx.userId ?? null, ctx.userRole ?? null,);
  if (!owned.ok) { return { systemMessage: owned.message, handled: true, }; }

  const spec = kind === "location" ? LOCATION_ADD_SPEC : ITEM_ADD_SPEC;
  const extraStart = worldArg !== undefined ? 3 : 2;
  const rawExtras = args.slice(extraStart,).join(" ",);
  // Extras are OPTIONAL: `/add item Sword w-1` is a valid bare-name add, the
  // route fills every other column with its own defaults.
  const parsed = rawExtras.trim() === ""
    ? { ok: true as const, patch: {} as Record<string, never>, }
    : parseEntityPatch(rawExtras, spec, kind,);

  if (!parsed.ok) {
    return { systemMessage: `**Add rejected:** ${parsed.error}`, handled: true, };
  }

  // Preview-time duplicate check mirroring the route's dedupe tuple: the POST
  // route funnels into `createDefinition`, which rejects an existing
  // (worldId, name, category) with a 409 AFTER the user confirmed. Category
  // omitted in the extras means the route's `enumOr` fallback "other". The
  // same name under a DIFFERENT category is allowed by the tuple and stays
  // allowed here.
  if (kind === "item") {
    // allowedValues on `category` guarantees membership in ItemCategory.
    const effectiveCategory = typeof parsed.patch.category === "string"
      ? (parsed.patch.category as ItemCategory)
      : ItemCategory.Other;

    const dup = await db
      .selectFrom("items",)
      .select("id",)
      .where("world_id", "=", worldId,)
      .where("name", "=", name,)
      .where("category", "=", effectiveCategory,)
      .executeTakeFirst();

    if (dup) {
      return {
        systemMessage:
          `**Add rejected:** an item named "${name}" already exists in world ${worldId} with category "${effectiveCategory}" — /clone it instead, or pick another name/category.`,
        handled: true,
      };
    }
  }

  const extras = Object.keys(parsed.patch,).length > 0 ? `\n\n${formatPatch(parsed.patch,)}` : "";
  return {
    systemMessage: [
      `**Add preview** — new **${kind}** **${name}** in world ${worldId}.${extras}`,
      "Confirm in the dialog to create it.",
    ].join("\n\n",),
    action: "add-entity",
    actionPayload: { kind, worldId, name, fields: parsed.patch, },
    handled: true,
  };
}, { requiredRole: "member", },);
