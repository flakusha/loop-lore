// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { getRuntimeConfig, } from "../../age-gate/controller";
import { getStatus, } from "../../age-gate/service";
import { createChat, getChatSetupTemplate, } from "../../chat/service";
import {
  ContentEncoding,
  MessageContentFormat,
  MessageContentType,
  MessageRole,
} from "../../db/enums";
import { isLlmGenerationConfigured, triggerAutoGeneration, } from "../../generation/auto-gen";
import { jsonParseOr, uid, } from "../../utils";
import { ChatCreateBody, } from "../../validation/schemas";
import {
  forbiddenResponse as forbidden,
  jsonCreated,
  notFoundResponse as notFound,
  requireUserId,
} from "../http-utils";
import type { HandlerOpts, } from "./types";

// ── Helpers (extracted for cognitive complexity) ────────────

async function checkAgeGate(database: HandlerOpts["database"], userId: string,): Promise<Response | null> {
  const config = getRuntimeConfig();
  if (!config.enabled || config.mode === "none") { return null; }
  const user = await database
    .selectFrom("users",)
    .select(["birth_date", "age_gate_accepted_at",],)
    .where("id", "=", userId,)
    .executeTakeFirst();
  const st = getStatus(config, user ?? null,);
  return st.hasPassed ? null : forbidden("Age gate not passed",);
}

function parseRawBody(ctx: { rawBodyText?: string },): Record<string, unknown> {
  const rawText = ctx.rawBodyText;
  return rawText ? jsonParseOr(rawText, {},) : {};
}

async function resolveTemplate(
  database: HandlerOpts["database"],
  body: { templateId?: string },
  rawBody: Record<string, unknown>,
  hasExplicit: (key: string,) => boolean,
) {
  if (!body.templateId && !hasExplicit("templateId",)) { return null; }
  const templateId = body.templateId ?? (rawBody.templateId as string | undefined);
  return templateId ? await getChatSetupTemplate(database, templateId,) : null;
}

async function seedWelcomeMessages(
  database: HandlerOpts["database"],
  chatId: string,
  body: { participantIds?: string[] },
  opts: HandlerOpts,
  userId: string,
) {
  const characterActors = await database
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select(["chat_participants.actor_id", "actors.welcome_message",],)
    .where("chat_participants.chat_id", "=", chatId,)
    .where("actors.welcome_message", "is not", null,)
    .execute();

  for (const actor of characterActors) {
    await database
      .insertInto("messages",)
      .values({
        id: uid(),
        chat_id: chatId,
        actor_id: actor.actor_id,
        parent_id: null,
        role: MessageRole.Character,
        content: actor.welcome_message!,
        key_id: null,
        content_type: MessageContentType.Text,
        content_format: MessageContentFormat.Markdown,
        content_encoding: ContentEncoding.Identity,
        status: "confirmed",
        visibility: "visible",
      },)
      .execute();
  }

  if (characterActors.length === 0 && body.participantIds?.length) {
    const { database: db, config, } = opts;
    if (isLlmGenerationConfigured(config,)) {
      void triggerAutoGeneration({ database: db, config, chatId, parentMessageId: null, userId, },);
    }
  }
}

export function createRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chats-create", },)
      .post(
        `${prefix}/chats`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const ageError = await checkAgeGate(database, userId,);
          if (ageError) { return ageError; }

          const body = ctx.body as typeof ChatCreateBody.static;
          const rawBody = parseRawBody(ctx,);
          const hasExplicit = (key: string,) => key in rawBody;

          const template = await resolveTemplate(database, body, rawBody, hasExplicit,);
          if (template === null && (body.templateId || hasExplicit("templateId",))) {
            return notFound("Chat setup template not found",);
          }

          const newChatId = await createChat(database, {
            name: body.name,
            type: body.type,
            mode: hasExplicit("mode",) ? body.mode : template?.mode ?? undefined,
            createdBy: userId,
            worldId: hasExplicit("worldId",) ? body.worldId : template?.world_id ?? undefined,
            currentLocationId: body.currentLocationId,
            turnStrategy: hasExplicit("turnStrategy",) ? body.turnStrategy : template?.turn_strategy ?? undefined,
            participantIds: body.participantIds,
            gmConfig: hasExplicit("gmConfig",)
              ? body.gmConfig
              : (template?.gm_config ? jsonParseOr(template.gm_config, {},) : undefined),
            visualNovel: hasExplicit("visualNovel",)
              ? body.visualNovel
              : (template ? template.visual_novel === 1 : undefined),
            visibility: hasExplicit("visibility",)
              ? body.visibility
              : (template?.visibility ?? undefined),
            templateId: template?.id,
            memoryCarry: body.memoryCarry,
            memoryCarryIds: body.memoryCarryIds,
          },);

          await seedWelcomeMessages(database, newChatId, body, opts, userId,);

          return jsonCreated({ id: newChatId, },);
        },
        { body: ChatCreateBody, },
      )
  );
}
