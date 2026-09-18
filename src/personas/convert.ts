// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Persona → character conversion
 *
 * Extracted from PersonasService: converts a persona row into a new
 * character actor, carrying persona-only fields in the actor settings JSON.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { uid, } from "../utils";
import { jsonStringifyOr, } from "../utils/safe-json";

/**
 * @param db
 * @param id - persona id
 * @param userId - owning user id
 * @throws {Error} `"Persona not found"` when no row matches `id` + `userId`
 *   (i.e. either the persona does not exist or it belongs to a different
 *   user). Callers must surface this as 404 to match getById / delete /
 *   update — a silent no-op would let wrong-id probes return 200 and hide
 *   ownership mistakes.
 */
export async function convertPersonaToCharacter(
  db: Kysely<DB>,
  id: string,
  userId: string,
): Promise<{ actorId: string }> {
  const persona = await db
    .selectFrom("personas",)
    .selectAll()
    .where("id", "=", id,)
    .where("user_id", "=", userId,)
    .executeTakeFirst();

  if (!persona) {
    getLogger()
      .child({ module: "personas", },)
      .warn("Persona not found for conversion", { personaId: id, userId, },);
    throw new Error("Persona not found",);
  }

  const actorId = uid();
  await db
    .insertInto("actors",)
    .values({
      id: actorId,
      actor_type: "character",
      display_name: persona.name,
      user_id: null,
      owner_id: userId,
      avatar_asset_id: persona.avatar_asset_id,
      description: persona.description,
      system_prompt: null,
      agent_type: "ai",
      // The actors table has no dedicated columns for the persona's
      // user-facing title or generation tuning, so carry them in the
      // settings JSON under a `persona` block — otherwise conversion
      // silently drops user data. Top-level settings keys stay free for
      // other features (prompt_template_id, tags, …).
      settings: jsonStringifyOr({
        persona: {
          title: persona.title,
          temperature: persona.temperature,
          max_tokens: persona.max_tokens,
          model: persona.model,
        },
      },),
      format_version: 0,
      import_spec: "raw",
      data_source_format: "json",
      data_raw: null,
    },)
    .execute();

  return { actorId, };
}
