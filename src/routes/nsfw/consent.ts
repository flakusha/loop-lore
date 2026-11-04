// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW consent grant/revoke route — `POST /api/v1/nsfw/consent`.
 *
 * The user id always comes from the session, never from the body, and the
 * caller must participate in the target chat — otherwise the route would be
 * a consent-row writer for arbitrary chats.
 *
 * The body is validated against the RAW request object, not only against the
 * framework's sanitized body: Elysia drops unknown keys of a `body` schema
 * instead of refusing them, so a client-supplied `userId` would be silently
 * ignored rather than rejected. The `parse` hook keeps the raw object on the
 * request context — never on `ctx.store`, which is shared across concurrent
 * requests — and the handler re-checks it against the closed DTO. That is the
 * 422 this route owes the caller.
 */
import type { Static, } from "@sinclair/typebox";
import { Value, } from "@sinclair/typebox/value";
import { type Context, Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { isChatOwner, } from "../../chat/service/owners-core";
import type { DB, } from "../../db/schema";
import { getChatParticipantUserIds, } from "../../middleware/nsfw-gate/access";
import { hasActiveConsent, recordNsfwConsent, } from "../../middleware/nsfw-gate/consent-ledger";
import { NsfwConsentBody, } from "../../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { log, } from "./shared";
import type { HandlerOpts, } from "./types";

/** Session identity attached by the auth middleware. */
interface AuthContext {
  userId: string | null;
  userRole: string | null;
}

/** Raw request body kept by the `parse` hook for the closed-DTO re-check. */
interface RawBodyContext {
  rawBody?: unknown;
}

/** Handler context: session identity plus the stashed raw body. */
type Ctx = Context & AuthContext & RawBodyContext;

/** The consent body, typed by the DTO the route validates against. */
type ConsentBody = Static<typeof NsfwConsentBody>;

/**
 * Whether the caller participates in the chat: a participant of the chat is
 * backed by the caller's user account, or the caller holds chat authority.
 * Consent is a per-(user, chat) concept, so a non-member must not be able to
 * plant a row.
 * @param database
 * @param chatId
 * @param userId
 * @returns {Promise<boolean>}
 */
async function isChatParticipantUser(
  database: Kysely<DB>,
  chatId: string,
  userId: string,
): Promise<boolean> {
  const participants = await getChatParticipantUserIds(database, chatId,);
  if (participants.includes(userId,)) { return true; }

  // The chat creator (and any current owner) may hold no participant row of
  // their own — the owners set is the authority source for a chat.
  return isChatOwner(database, chatId, userId,);
}

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { nsfw: { consent: { ...; }; }; }; } & { ...; } & { ...; }, { ...; }, { ...; }>}
 */
export function consentRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "nsfw-consent", },)
      .post(
        `${prefix}/nsfw/consent`,
        async (ctx,) => {
          const c = ctx as unknown as Ctx;
          try {
            const userId = requireUserId(c,);
            if (typeof userId !== "string") { return userId; }

            // The framework already validated the sanitized body; re-checking
            // the raw object is what refuses the extra keys it dropped.
            const raw = c.rawBody;
            if (!raw || !Value.Check(NsfwConsentBody, raw,)) {
              return jsonError("Validation failed", 422,);
            }

            const body = raw as ConsentBody;

            if (!(await isChatParticipantUser(database, body.chatId, userId,))) {
              return jsonError("Forbidden", 403,);
            }

            const row = await recordNsfwConsent({
              database,
              chatId: body.chatId,
              userId,
              action: body.action,
              scope: body.scope,
              reason: body.reason,
            },);

            log().info("NSFW consent recorded", {
              userId,
              chatId: body.chatId,
              action: row.action,
            },);

            return jsonResponse({
              chatId: row.chatId,
              action: row.action,
              scope: row.scope,
              reason: row.reason,
              createdAt: row.createdAt,
              revokedAt: row.revokedAt,
              granted: hasActiveConsent(row,),
            },);
          } catch (error) {
            log().error("Failed to record NSFW consent", error instanceof Error ? error : undefined,);
            return jsonError("Internal server error", 500,);
          }
        },
        {
          body: NsfwConsentBody,
          // Keep the raw request body: the framework sanitizes `ctx.body`
          // (dropping unknown keys), and the closed DTO has to be checked
          // against the untouched request to refuse a client-supplied user id.
          parse: async (parseCtx,) => {
            const raw = await parseCtx.request.json().catch(() => undefined);
            (parseCtx as unknown as RawBodyContext).rawBody = raw;
            return raw;
          },
        },
      )
  );
}
