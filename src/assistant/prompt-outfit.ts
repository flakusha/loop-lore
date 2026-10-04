// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Prompt assembler — wardrobe outfit resolution (split from prompt-assembler.ts). */
import type { Kysely, } from "kysely";
import { resolveOutfit, } from "../characters/services/wardrobe/resolve";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import type { AssembleChat, PromptParams, } from "./prompt/types";

/**
 * Resolve the character's current outfit for prompt narration context.
 * @param db
 * @param params - Prompt params (provides actor + explicit chat scope)
 * @param chat - Assembled chat projection (world/location scope)
 * @returns The resolved outfit name + ladder source, or undefined when no
 *   outfit is bound (emotion-only characters keep today's prompt).
 */
async function resolveCurrentOutfit(
  db: Kysely<DB>,
  params: PromptParams,
  chat: AssembleChat,
): Promise<{ name: string; source: string } | undefined> {
  try {
    const resolved = await resolveOutfit(db, {
      actorId: params.actorId,
      chatId: chat.id,
      worldId: chat.world_id ?? undefined,
      locationId: chat.current_location_id ?? undefined,
    },);

    if (!resolved.outfitId) { return undefined; }
    const item = await db
      .selectFrom("wardrobe_items",)
      .select(["name",],)
      .where("id", "=", resolved.outfitId,)
      .executeTakeFirst();

    if (!item) { return undefined; }
    return { name: item.name, source: resolved.source, };
  } catch (error) {
    // Wardrobe lookup is best-effort — same contract as the mood lookup.
    getLogger().debug("prompt-assembler: outfit lookup failed, skipping outfit injection", { err: error, },);
    return undefined;
  }
}

/**
 * Attach the resolved outfit to the prompt params when the caller did not
 * supply one explicitly. The `outfitContext` section fires only when
 * `params.outfit` is set, so this wires the wardrobe ladder (chat override >
 * location rule > default outfit) into the narration context.
 * @param db
 * @param params - Prompt params to enrich
 * @param chat - Assembled chat projection (world/location scope)
 * @returns the params with `outfit` + `outfitSource` when the ladder resolves
 *   an outfit, otherwise the params unchanged.
 */
export async function withResolvedOutfit(
  db: Kysely<DB>,
  params: PromptParams,
  chat: AssembleChat,
): Promise<PromptParams> {
  if (params.outfit !== undefined) { return params; }
  const resolved = await resolveCurrentOutfit(db, params, chat,);
  if (!resolved) { return params; }
  return { ...params, outfit: resolved.name, outfitSource: resolved.source, };
}
