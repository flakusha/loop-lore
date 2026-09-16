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
import { canAccessNsfw, getActorContentRating, isNsfwRating, } from "../../middleware/nsfw-gate";
import { jsonParseOr, uid, } from "../../utils";
import {
  CHAT_VARIANTS,
  VARIANT_DEFAULTS,
  validateVariantTriple,
  type ChatVariant,
} from "../../chat/types/variants";
import { ChatCreateBody, } from "../../validation/schemas";
import {
  badRequestResponse as badRequest,
  forbiddenResponse as forbidden,
  jsonCreated,
  notFoundResponse as notFound,
  requireUserId,
} from "../http-utils";
import type { HandlerOpts, } from "./types";

// ── Helpers (extracted for cognitive complexity) ────────────

/**
 * @param database
 * @param userId
 */
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

/**
 * @param ctx
 * @param ctx.rawBodyText
 */
function parseRawBody(ctx: { rawBodyText?: string },): Record<string, unknown> {
  const rawText = ctx.rawBodyText;
  return rawText ? jsonParseOr(rawText, {},) : {};
}

/**
 * @param database
 * @param body
 * @param body.templateId
 * @param rawBody
 * @param hasExplicit
 */
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

/**
 * @param database
 * @param chatId
 * @param body
 * @param body.participantIds
 * @param opts
 * @param userId
 */
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

/**
 * Check NSFW access for chat participants.
 * Blocks creation if user cannot access NSFW and any participant is NSFW-rated.
 * @param opts
 * @param userId
 * @param participantIds
 */
async function checkNsfwAccessForParticipants(
  opts: HandlerOpts,
  userId: string,
  participantIds: string[] | undefined,
): Promise<Response | null> {
  if (!participantIds || participantIds.length === 0) { return null; }
  const userAccess = await canAccessNsfw(opts.database, opts.config, userId,);
  if (userAccess.allowed) { return null; }
  for (const pid of participantIds) {
    const rating = await getActorContentRating(opts.database, pid,);
    if (isNsfwRating(rating,)) {
      return forbidden(`NSFW access denied: ${userAccess.reason}`,);
    }
  }
  return null;
}

/**
 * @param opts
 * @param prefix
 */
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

          // ── NSFW access gate ─────────────────────────────────
          const nsfwError = await checkNsfwAccessForParticipants(opts, userId, body.participantIds,);
          if (nsfwError) { return nsfwError; }
          const rawBody = parseRawBody(ctx,);
          const hasExplicit = (key: string,) => key in rawBody;

          const template = await resolveTemplate(database, body, rawBody, hasExplicit,);
          if (template === null && (body.templateId || hasExplicit("templateId",))) {
            return notFound("Chat setup template not found",);
          }

          // ── Variant validation: optional `variant` field that pins the
          // (type, mode, purpose) triple to the canonical taxonomy table.
          let resolvedType: string | undefined;
          let resolvedMode: string | undefined;
          let resolvedPurpose: string | undefined;
          let resolvedGmConfig: Record<string, unknown> | undefined;
          const rawVariant = rawBody.variant as string | undefined;
          if (rawVariant !== undefined) {
            if (!(CHAT_VARIANTS as readonly string[]).includes(rawVariant,)) {
              return badRequest(`Unknown chat variant: ${rawVariant}`);
            }
            const variant = rawVariant as ChatVariant;
            const def = VARIANT_DEFAULTS[variant];
            // If the caller also supplies any of type/mode/purpose, they must
            // match the variant table; otherwise the variant default applies.
            const suppliedType = hasExplicit("type",) ? body.type : undefined;
            const suppliedMode = hasExplicit("mode",) ? body.mode : template?.mode ?? undefined;
            const suppliedPurpose = hasExplicit("purpose",)
              ? (rawBody.purpose as string)
              : undefined;
            if (
              suppliedType !== undefined || suppliedMode !== undefined || suppliedPurpose !== undefined
            ) {
              const err = validateVariantTriple(
                variant,
                suppliedType ?? def.chat_type,
                suppliedMode ?? def.chat_mode,
                suppliedPurpose ?? def.chat_purpose,
              );
              if (err) { return badRequest(err); }
            }
            // Lock the triple to the variant defaults. Variant wins over caller
            // for mode/purpose where the caller did not pin them.
            resolvedType = suppliedType ?? def.chat_type;
            resolvedMode = suppliedMode ?? def.chat_mode;
            resolvedPurpose = suppliedPurpose ?? def.chat_purpose;
            // Variant-derived gm_config seeds the row's gm_config when the
            // caller did not provide one explicitly.
            if (!hasExplicit("gmConfig",) && def.gm_config !== null) {
              resolvedGmConfig = def.gm_config as Record<string, unknown>;
            }
          }

          const newChatId = await createChat(database, {
            name: body.name,
            type: resolvedType ?? body.type,
            mode: resolvedMode ?? (hasExplicit("mode",) ? body.mode : template?.mode ?? undefined),
            createdBy: userId,
            worldId: hasExplicit("worldId",) ? body.worldId : template?.world_id ?? undefined,
            currentLocationId: body.currentLocationId,
            turnStrategy: hasExplicit("turnStrategy",) ? body.turnStrategy : template?.turn_strategy ?? undefined,
            participantIds: body.participantIds,
            gmConfig: resolvedGmConfig ?? (hasExplicit("gmConfig",)
              ? body.gmConfig
              : (template?.gm_config ? jsonParseOr(template.gm_config, {},) : undefined)),
            renderingOverride: hasExplicit("renderingOverride",)
              ? body.renderingOverride
              : (template
                ? (jsonParseOr<Record<string, unknown>>(template.gm_config ?? "{}", {},).renderingOverride ===
                    "visual_novel"
                  ? "visual_novel"
                  : null)
                : undefined),
            visibility: hasExplicit("visibility",)
              ? body.visibility
              : (template?.visibility ?? undefined),
            encryptionLevel: body.encryptionLevel,
            templateId: template?.id,
          },);

          await seedWelcomeMessages(database, newChatId, body, opts, userId,);

          return jsonCreated({ id: newChatId, },);
        },
        { body: ChatCreateBody, },
      )
  );
}
