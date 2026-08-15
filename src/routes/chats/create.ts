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

export function createRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chats-create", },)
      .post(
        `${prefix}/chats`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const ageGateConfig = getRuntimeConfig();
          if (ageGateConfig.enabled && ageGateConfig.mode !== "none") {
            const user = await database
              .selectFrom("users",)
              .select(["birth_date", "age_gate_accepted_at",],)
              .where("id", "=", userId,)
              .executeTakeFirst();
            const st = getStatus(ageGateConfig, user ?? null,);
            if (!st.hasPassed) { return forbidden("Age gate not passed",); }
          }

          const body = ctx.body as typeof ChatCreateBody.static;

          // Elysia applies defaults to optional enum fields (mode → "direct",
          // type → "direct", turnStrategy → "round_robin"), so we can't tell from
          // `body` alone which fields the client explicitly sent. Use the raw
          // body captured by onParse so template seeding wins unless overridden.
          let rawBody: Record<string, unknown> = {};
          const rawText = (ctx as { rawBodyText?: string }).rawBodyText;
          if (rawText) {
            rawBody = jsonParseOr(rawText, {},);
          }
          const hasExplicit = (key: string,) => key in rawBody;

          // Seed key mechanics from a template if provided (explicit fields override)
          let template = null;
          if (body.templateId || hasExplicit("templateId",)) {
            const templateId = body.templateId ?? (rawBody.templateId as string | undefined);
            template = templateId ? await getChatSetupTemplate(database, templateId,) : null;
            if (!template) { return notFound("Chat setup template not found",); }
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

          const characterActors = await database
            .selectFrom("chat_participants",)
            .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
            .select(["chat_participants.actor_id", "actors.welcome_message",],)
            .where("chat_participants.chat_id", "=", newChatId,)
            .where("actors.welcome_message", "is not", null,)
            .execute();

          for (const actor of characterActors) {
            await database
              .insertInto("messages",)
              .values({
                id: uid(),
                chat_id: newChatId,
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

          // If no welcome message was created for any participant, trigger
          // LLM auto-generation so the assistant sends an initial greeting.
          if (characterActors.length === 0 && body.participantIds && body.participantIds.length > 0) {
            const { database: db, config, } = opts;
            if (isLlmGenerationConfigured(config,)) {
              void triggerAutoGeneration({
                database: db,
                config,
                chatId: newChatId,
                parentMessageId: null,
                userId,
              },);
            }
          }

          return jsonCreated({ id: newChatId, },);
        },
        { body: ChatCreateBody, },
      )
  );
}
