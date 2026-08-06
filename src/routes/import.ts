// src/routes/import.ts
//
// Character import routes.
// Handles import via multipart upload with auto-detection.
// Supports CHARX asset auto-import (avatars, audio, etc.).

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { createAsset, detectAssetType, linkAsset, mimeFromExtension, } from "../assets/service";
import { extractCharx, } from "../characters/charx";
import {
  AssetImportError,
  CharacterValidationError,
  handleImportExportError,
} from "../characters/errors";
import { parseCharacterCard, validateCharacter, } from "../characters/parser";
import type { CanonicalCharacter, } from "../characters/parser";
import type { LorebookData, } from "../characters/spec";
import type { AuthConfig, } from "../config/schema";
import { AssetLinkEntity, LoreEntryStatus, } from "../db/enums";
import type { DB, } from "../db/schema";
import { authenticate, } from "../middleware/auth";
import { jsonStringifyOr, safeJsonStringify, uid, } from "../utils";
import { safeFromUint8Array, } from "../utils/safe-buffer";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { HttpStatus, jsonCreated, jsonError, unauthorizedResponse, } from "./http-utils";

interface ImportActorOpts {
  character: CanonicalCharacter;
  format: string;
  warnings: string[];
  database: Kysely<DB>;
  userId: string;
  rawSource?: string;
  sourceFormat?: string;
  charxAssets?: { name: string; type: string; data: Buffer }[];
  uploadDir?: string;
}

/**
 * Import lorebook entries for a character.
 * Maps LorebookData from parsed character card to actor_lore_entries table.
 */
async function importLorebook(
  database: Kysely<DB>,
  actorId: string,
  lorebook: LorebookData,
  warnings: string[],
): Promise<number> {
  let imported = 0;

  for (const entry of lorebook.entries) {
    try {
      await database
        .insertInto("actor_lore_entries",)
        .values({
          id: uid(),
          actor_id: actorId,
          name: entry.name || null,
          content: entry.content,
          keys: (() => {
            const r = safeJsonStringify(entry.keys,);
            return r.ok ? r.value : "[]";
          })(),
          secondary_keys: "[]",
          selective: entry.selective ? 1 : 0,
          case_sensitive: entry.case_sensitive ? 1 : 0,
          enabled: entry.enabled ? LoreEntryStatus.Enabled : LoreEntryStatus.Disabled,
          constant: entry.constant ? 1 : 0,
          position: entry.position,
          insertion_order: entry.insertion_order,
          priority: entry.priority,
          comment: entry.comment ?? null,
          sort_order: entry.id ?? imported,
        },)
        .execute();
      imported++;
    } catch (error) {
      const entryName = entry.name ?? `#${entry.id}`;
      const errorMsg = error instanceof Error ? error.message : "unknown error";
      warnings.push(`Failed to import lore entry "${entryName}": ${errorMsg}`,);
    }
  }

  return imported;
}

async function importActor(opts: ImportActorOpts,): Promise<Response> {
  const { character, format, warnings, database, userId, charxAssets, uploadDir, } = opts;

  // Validate character
  const validationErrors = validateCharacter(character,);
  if (validationErrors.length > 0) {
    throw new CharacterValidationError(validationErrors,);
  }

  const id = uid();

  // Convert alternate_greetings to JSON string
  let alternateGreetings: string | null = null;
  if (character.alternate_greetings && character.alternate_greetings.length > 0) {
    const result = safeJsonStringify(character.alternate_greetings,);
    if (result.ok) { alternateGreetings = result.value; }
  }

  // Insert character as actor
  await database
    .insertInto("actors",)
    .values({
      id,
      actor_type: "character",
      display_name: character.name,
      user_id: userId,
      owner_id: userId,
      agent_type: "ai",
      description: character.description,
      system_prompt: character.system_prompt ?? null,
      welcome_message: character.welcome_message ?? null,
      personality: character.personality ?? null,
      scenario: character.scenario ?? null,
      mes_example: character.mes_example ?? null,
      post_history_instructions: character.post_history_instructions ?? null,
      creator_notes: character.creator_notes ?? null,
      creator: character.creator ?? null,
      character_version: character.character_version ?? null,
      import_spec: format,
      data_source_format: opts.sourceFormat ?? format,
      data_raw: opts.rawSource ?? null,
      alternate_greetings: alternateGreetings,
      settings: "{}",
      format_version: 0,
    },)
    .execute();

  // Import CHARX assets (avatars, audio, etc.)
  if (charxAssets && charxAssets.length > 0 && uploadDir) {
    let avatarImported = 0;
    for (const asset of charxAssets) {
      try {
        const mime = mimeFromExtension(asset.name,);
        const assetType = detectAssetType(mime,);

        const { asset: assetRecord, } = await createAsset({
          database,
          input: {
            ownerId: userId,
            filename: asset.name,
            mimeType: mime,
            assetType,
            sizeBytes: asset.data.length,
            buffer: asset.data,
            altText: `${character.name} - ${asset.type}`,
          },
          uploadDir,
        },);

        // Link asset to the imported character
        const label = asset.type === "avatar" ? "avatar" : asset.type;
        await linkAsset({
          database,
          assetId: assetRecord.id,
          link: {
            entityType: AssetLinkEntity.Actor,
            entityId: id,
            label,
          },
        },);

        if (asset.type === "avatar") {
          avatarImported++;
        }
      } catch (error) {
        // Log but don't fail import for asset errors
        const assetError = new AssetImportError(
          asset.name,
          error instanceof Error ? error.message : "unknown error",
        );
        warnings.push(assetError.message,);
      }
    }

    if (avatarImported > 0) {
      warnings.push(`Imported ${avatarImported} avatar(s) from CHARX`,);
    }
  }

  // Import lorebook entries if present
  if (character.lorebook && character.lorebook.entries.length > 0) {
    const loreCount = await importLorebook(database, id, character.lorebook, warnings,);
    if (loreCount > 0) {
      warnings.push(`Imported ${loreCount} lore entries`,);
    }
  }

  return jsonCreated({
    id,
    name: character.name,
    format,
    warnings,
    assets_imported: charxAssets?.length ?? 0,
    lore_entries_imported: character.lorebook?.entries.length ?? 0,
  },);
}

async function handleImport(
  request: Request,
  database: Kysely<DB>,
  userId: string,
  uploadDir?: string,
): Promise<Response> {
  if (!userId) { return unauthorizedResponse(); }

  const contentType = request.headers.get("content-type",) ?? "";

  if (contentType.includes("multipart/form-data",)) {
    const formData = await request.formData();
    const file = formData.get("file",);
    if (!file || !(file instanceof File)) {
      return jsonError({ message: "file field is required", status: HttpStatus.BadRequest, },);
    }

    const fileBytesResult = safeFromUint8Array(Buffer.from(await file.arrayBuffer(),),);
    if (!fileBytesResult.ok) {
      return jsonError({ message: fileBytesResult.error.message, status: HttpStatus.BadRequest, },);
    }
    const fileBytes = fileBytesResult.buffer;
    const filename = file.name ?? "";

    try {
      // Check for CHARX format (ZIP with card.json)
      const isCharx = filename.toLowerCase().endsWith(".charx",) ||
        (fileBytes.length > 4 &&
          fileBytes[0] === 0x50 && fileBytes[1] === 0x4B &&
          fileBytes[2] === 0x03 && fileBytes[3] === 0x04);

      if (isCharx) {
        // Extract CHARX assets
        const charxResult = await extractCharx(fileBytes,);
        const charxAssets: { name: string; type: string; data: Buffer }[] = [];
        for (const asset of charxResult.assets) {
          if (asset.data !== undefined) {
            charxAssets.push({
              name: `${asset.name}.${asset.ext}`,
              type: asset.type,
              data: asset.data,
            },);
          }
        }

        // Parse the card from CHARX
        const cardJsonResult = safeJsonStringify(charxResult.card,);
        const result = await parseCharacterCard(
          Buffer.from(cardJsonResult.ok ? cardJsonResult.value : jsonStringifyOr(charxResult.card, "{}",), "utf8",),
          filename,
        );

        return await importActor({
          character: result.character,
          format: "charx",
          warnings: result.warnings,
          database,
          userId,
          rawSource: filename,
          sourceFormat: "charx",
          charxAssets,
          uploadDir,
        },);
      }

      // Standard parse for non-CHARX formats
      const result = await parseCharacterCard(fileBytes, filename,);

      // For PNG imports, the file itself is the avatar
      let pngAvatar: { name: string; type: string; data: Buffer } | undefined;
      if ((result.format === "png-v2" || result.format === "png-v3") && uploadDir) {
        pngAvatar = {
          name: `${filename.replace(/\.[^/.]+$/, "",) || "avatar"}.png`,
          type: "avatar",
          data: fileBytes,
        };
      }

      // Import the character
      const rawSource = fileBytes.toString("utf8",);
      return await importActor({
        character: result.character,
        format: result.format,
        warnings: result.warnings,
        database,
        userId,
        rawSource,
        sourceFormat: result.format,
        charxAssets: pngAvatar ? [pngAvatar,] : undefined,
        uploadDir,
      },);
    } catch (error) {
      // Handle structured import errors
      const handled = handleImportExportError(error,);
      if (handled.handled) {
        return handled.response;
      }

      // Handle other errors
      const parseError = error as { code?: string; message?: string; suggestion?: string };
      return jsonError({
        message: parseError.message ?? "Failed to parse character card",
        status: HttpStatus.BadRequest,
      },);
    }
  }

  return jsonError({ message: "Expected multipart/form-data", status: HttpStatus.BadRequest, },);
}

export function importRoutes(
  { database, config, }: { database: Kysely<DB>; config: { auth: AuthConfig; assets?: { uploadDir?: string } } },
): Elysia {
  const uploadDir = config.assets?.uploadDir;

  return new Elysia({ name: "import", },).post("/api/actors/import", async (ctx: any,) => {
    // authenticate directly before .derive()
    const authResult = await authenticate({ request: ctx.request, database, authConfig: config.auth, },);
    if (authResult instanceof Response) { return authResult; }
    return handleImport(ctx.request, database, authResult.context.userId!, uploadDir,);
  }, {
    response: {
      200: SuccessResponse,
      401: ErrorResponse,
    },
    detail: {
      summary: "Import a character",
      description:
        "Import a character card from a file upload. Supports CHARX, PNG, and JSON formats with auto-detection and asset import.",
      tags: ["Import",],
    },
  },) as unknown as Elysia;
}
