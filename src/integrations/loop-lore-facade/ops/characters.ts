// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/ops/characters.ts — facade ops over the
// caller's own characters (harness parity gap #6: characters had no facade
// op).
//
// SECURITY: a character belongs to the caller when `actors.owner_id` or
// `actors.user_id` names the calling user — the repo's own ownership links
// (src/routes/entity-routes/context.ts). Another user's character is a 404,
// never its data, and the card payload carries ONLY the public card fields:
// no system prompt, no creator notes, no example messages, no extensions and
// no raw import blob.

import { type Static, } from "@sinclair/typebox";
import { Value, } from "@sinclair/typebox/value";
import { t, } from "elysia";
import type { Kysely, } from "kysely";
import { chatPolicy, } from "../../../api-governance/rate-limiting/policies";
import { cardTags, } from "../../../characters/card-settings";
import type { Config, } from "../../../config/schema";
import type { DB, } from "../../../db/schema";
import { type FacadeRegistry, } from "../registry";
import type { FacadeContext, FacadeOp, FacadeOutputSchema, FacadeResult, } from "../types";
import { badBodyResult, callerIdentity, callerOwnsActor, notFoundResult, READ_ONLY_ANNOTATIONS, } from "./shared";

/** Shared registration deps — the same shape the other op modules carry. */
export interface CharactersFacadeDeps {
  database: Kysely<DB>;
  config: Config;
}

/** characters.list body: pagination only. */
export const CharactersListBody = t.Object({
  page: t.Optional(t.Number({ minimum: 1, },),),
  pageSize: t.Optional(t.Number({ minimum: 1, maximum: 200, },),),
},);

/** characters.get body: the character (actor) id. */
export const CharactersGetBody = t.Object({ actorId: t.String({ minLength: 1, },), },);

/** The summary fields characters.list returns per character. */
const CHARACTER_SUMMARY_PROPERTIES = {
  id: { type: "string", },
  name: { type: "string", },
  actorType: { type: "string", },
  visibility: { type: "string", },
  createdAt: { type: "string", },
};

/** The public card fields characters.get returns — nothing else. */
const CHARACTER_CARD_PROPERTIES = {
  id: { type: "string", },
  name: { type: "string", },
  description: { type: "string", },
  personality: { type: "string", },
  scenario: { type: "string", },
  firstMes: { type: "string", },
  tags: { type: "array", items: { type: "string", }, },
};

/** characters.list's structured result: the summaries + the total count. */
export const CharactersListOutputSchema: FacadeOutputSchema = {
  type: "object",
  properties: {
    data: { type: "array", items: { type: "object", properties: CHARACTER_SUMMARY_PROPERTIES, }, },
    total: { type: "number", },
  },
  required: ["data", "total",],
};

/** characters.get's structured result: the public card fields. */
export const CharacterCardOutputSchema: FacadeOutputSchema = {
  type: "object",
  properties: CHARACTER_CARD_PROPERTIES,
  required: ["id", "name", "description", "personality", "scenario", "firstMes", "tags",],
};

/**
 * Register the characters ops on a registry.
 * @param registry - the facade registry
 * @param deps - database/config the ops read through
 * @throws {Error} when an op name collides on registration
 */
export function registerCharactersOps(registry: FacadeRegistry, deps: CharactersFacadeDeps,): void {
  const { database, } = deps;

  const ops: FacadeOp[] = [
    {
      name: "characters.list",
      domain: "characters",
      summary: "List the calling principal's own characters",
      description: "The characters the calling user owns (the repo's owner_id / user_id links). " +
        "Another user's characters are never listed — the facade grants no blanket admin access.",
      scope: "read",
      ratePolicy: chatPolicy,
      bodySchema: CharactersListBody,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: CharactersListOutputSchema,
      handler: async (ctx: FacadeContext, body: unknown,): Promise<FacadeResult> => {
        if (!Value.Check(CharactersListBody, body,)) { return badBodyResult("characters.list",); }
        const parsed = body as Static<typeof CharactersListBody>;
        const { userId, } = callerIdentity(ctx,);

        const page = parsed.page ?? 1;
        const pageSize = Math.min(parsed.pageSize ?? 50, 200,);

        const countRow = await database
          .selectFrom("actors",)
          .select(database.fn.countAll<number>().as("total",),)
          .where((eb,) => eb("owner_id", "=", userId,).or("user_id", "=", userId,))
          .executeTakeFirst();

        const rows = await database
          .selectFrom("actors",)
          .select(["id", "display_name", "actor_type", "visibility", "created_at",],)
          .where((eb,) => eb("owner_id", "=", userId,).or("user_id", "=", userId,))
          .orderBy("display_name", "asc",)
          .limit(pageSize,)
          .offset((page - 1) * pageSize,)
          .execute();

        const data = rows.map((row,) => ({
          id: row.id,
          name: row.display_name,
          actorType: row.actor_type,
          visibility: row.visibility,
          createdAt: row.created_at,
        }));

        return { ok: true, status: 200, json: { data, total: countRow?.total ?? 0, }, };
      },
    },
    {
      name: "characters.get",
      domain: "characters",
      summary: "Fetch one of the caller's characters as a public card",
      description: "The public card fields only: name, description, personality, scenario, first " +
        "message and tags. A character the calling user does not own is a 404, and the card's " +
        "secrets (system prompt, creator notes, example messages, extensions) are never returned.",
      scope: "read",
      ratePolicy: chatPolicy,
      bodySchema: CharactersGetBody,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: CharacterCardOutputSchema,
      handler: async (ctx: FacadeContext, body: unknown,): Promise<FacadeResult> => {
        if (!Value.Check(CharactersGetBody, body,)) { return badBodyResult("characters.get",); }
        const parsed = body as Static<typeof CharactersGetBody>;
        const { userId, } = callerIdentity(ctx,);

        const owned = await callerOwnsActor({ database, actorId: parsed.actorId, userId, },);
        if (!owned) { return notFoundResult("character not found",); }

        const actor = await database
          .selectFrom("actors",)
          .select(["id", "display_name", "description", "personality", "scenario", "welcome_message", "settings",],)
          .where("id", "=", parsed.actorId,)
          .executeTakeFirst();

        if (!actor) { return notFoundResult("character not found",); }

        return {
          ok: true,
          status: 200,
          json: {
            id: actor.id,
            name: actor.display_name,
            description: actor.description ?? "",
            personality: actor.personality ?? "",
            scenario: actor.scenario ?? "",
            firstMes: actor.welcome_message ?? "",
            tags: cardTags(actor.settings,) ?? [],
          },
        };
      },
    },
  ];

  for (const op of ops) {
    const registered = registry.register(op,);
    if (!registered.ok) {
      throw new Error(registered.message,);
    }
  }
}
