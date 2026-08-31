// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { exportToCcV3Json, } from "../../characters/exporters/ccv3";
import { exportToPng, } from "../../characters/exporters/png";
import { exportToYaml, } from "../../characters/exporters/yaml";
import type { CanonicalCharacter, } from "../../characters/parser";
import { jsonParseOr, } from "../../utils";
import { addChecksum, } from "./helpers";
import type { ExportContext, } from "./types";

/**
 * Export the user's characters into `zip/characters/` in the requested format.
 * Populates `ctx.counts.characters`.
 * @param ctx
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
