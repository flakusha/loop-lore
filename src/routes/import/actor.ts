import { createAsset, detectAssetType, linkAsset, mimeFromExtension, } from "../../assets/service";
import { AssetImportError, CharacterValidationError, } from "../../characters/errors";
import { validateCharacter, } from "../../characters/parser";
import { AssetLinkEntity, } from "../../db/enums";
import { safeJsonStringify, uid, } from "../../utils";
import { jsonCreated, } from "../http-utils";
import { importLorebook, } from "./lorebook";
import type { ImportActorOpts, } from "./types";

export async function importActor(opts: ImportActorOpts,): Promise<Response> {
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
