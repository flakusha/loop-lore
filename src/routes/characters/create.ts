// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { ActorType, AgentType, } from "../../db/enums";
import { jsonStringifyOr, uid, } from "../../utils";
import {
  ActorCreateBody,
  ErrorResponse,
} from "../../validation/schemas";
import { jsonCreated, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

export function createRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "characters-create", },)
    .post(
      `${prefix}/actors`,
      async (ctx: any,) => {
        const {
          displayName,
          tags,
          actorType,
          agentType,
          agentRole,
          description,
          personality,
          scenario,
          welcomeMessage,
          systemPrompt,
        } = ctx.body;
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const id = uid();
        const parsedTags: string[] = [];
        if (tags) {
          for (const t of tags.split(",",)) {
            const trimmed = t.trim();
            if (trimmed) { parsedTags.push(trimmed,); }
          }
        }
        const settings = parsedTags.length > 0 ? jsonStringifyOr({ tags: parsedTags, },) : "{}";
        await database
          .insertInto("actors",)
          .values({
            id,
            actor_type: actorType ?? ActorType.Character,
            display_name: displayName,
            user_id: userId,
            owner_id: userId,
            agent_type: agentType ?? AgentType.Ai,
            agent_role: agentRole ?? null,
            description: description ?? null,
            personality: personality ?? null,
            scenario: scenario ?? null,
            welcome_message: welcomeMessage ?? null,
            system_prompt: systemPrompt ?? null,
            settings,
            import_spec: "raw",
            data_source_format: "json",
            data_raw: null,
            format_version: 0,
          },)
          .execute();

        return jsonCreated({ id, },);
      },
      {
        body: ActorCreateBody,
        response: {
          201: t.Object({ id: t.String(), },),
          401: ErrorResponse,
        },
        detail: {
          summary: "Create actor",
          description: "Create a new character or actor. Requires authentication.",
          tags: ["Characters",],
        },
      },
    );
}
