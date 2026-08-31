// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * User persona section — when the human user is impersonating a character or
 * has selected a persona, inject that identity into the user slot.
 */
import type { GenerationMessage, } from "../../../generation/gen-types-options";
import { wrapSection, } from "../../xml-utils";
import type { AssembleContext, SectionBuilder, } from "../types";

export const userPersonaSection: SectionBuilder = {
  name: "userPersona",
  enabled: (ctx,) => !!ctx.params.userId,
  build: async (ctx,) => {
    const userId = ctx.params.userId ?? "";
    const participant = await ctx.db
      .selectFrom("chat_participants",)
      .select(["impersonate_actor_id", "persona_id",],)
      .where("chat_id", "=", ctx.params.chatId,)
      .where("actor_id", "=", userId,)
      .executeTakeFirst();

    if (!participant) { return []; }

    if (participant.impersonate_actor_id) {
      return buildImpersonationSection(ctx, participant.impersonate_actor_id,);
    }

    if (participant.persona_id) {
      return buildPersonaSection(ctx, participant.persona_id,);
    }
    return [];
  },
};

/**
 * Build the user persona section from a stored persona.
 * @param ctx
 * @param personaId
 */
async function buildPersonaSection(
  ctx: AssembleContext,
  personaId: string,
): Promise<GenerationMessage[]> {
  const persona = await ctx.db
    .selectFrom("personas",)
    .select(["name", "description",],)
    .where("id", "=", personaId,)
    .executeTakeFirst();

  if (!persona) { return []; }

  const personaParts: string[] = [];
  if (persona.name) { personaParts.push(`Name: ${persona.name}`,); }
  if (persona.description) { personaParts.push(`\nDescription: ${persona.description}`,); }

  if (personaParts.length === 0) { return []; }
  return [{ role: "system", content: wrapSection("user_persona", personaParts.join("",),), },];
}

/**
 * Build the user persona section from an impersonated actor.
 * @param ctx
 * @param impersonateActorId
 */
async function buildImpersonationSection(
  ctx: AssembleContext,
  impersonateActorId: string,
): Promise<GenerationMessage[]> {
  const impersonatedActor = await ctx.db
    .selectFrom("actors",)
    .select(["display_name", "description", "personality",],)
    .where("id", "=", impersonateActorId,)
    .executeTakeFirst();

  if (!impersonatedActor) { return []; }

  const personaParts: string[] = [];
  if (impersonatedActor.display_name) { personaParts.push(`Name: ${impersonatedActor.display_name}`,); }
  if (impersonatedActor.description) {
    personaParts.push(`\nDescription: ${impersonatedActor.description}`,);
  }
  if (impersonatedActor.personality) {
    personaParts.push(`\nPersonality: ${impersonatedActor.personality}`,);
  }

  if (personaParts.length === 0) { return []; }
  return [{ role: "system", content: wrapSection("user_persona", personaParts.join("",),), },];
}
