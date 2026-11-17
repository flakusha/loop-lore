// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin MFA channel configuration (code-channel-first delivery settings).
 *
 * GET/PATCH /api/admin/mfa/config — also mounted at /api/v1 by adminRoutes.
 * The messenger bot token is write-only: GET reports `tokenConfigured` and
 * never the token. Field names, defaults and storage keys come from the
 * read/save helpers in src/auth/channels/{email,messenger}.ts; those helpers
 * are the single source of truth for the system_config rows.
 */
import { type Context, Elysia, t, } from "elysia";
import { getConfigValue, } from "../../admin/config";
import {
  MFA_EMAIL_SENDER_KEY,
  readMfaEmailSender,
  readMfaEmailWindowMs,
  saveMfaEmailSender,
  saveMfaEmailWindowMs,
} from "../../auth/channels/email";
import {
  readMfaMessengerBotToken,
  readMfaMessengerSender,
  readMfaMessengerWindowMs,
  saveMfaMessengerBotToken,
  saveMfaMessengerSender,
  saveMfaMessengerWindowMs,
} from "../../auth/channels/messenger";
import { ErrorCode, HttpStatus, jsonError, withPermissionAuth, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/** Auth fields populated by the global derive; tests inject the same shape. */
interface AuthContext {
  userId: string | null;
  userRole: string | null;
}
type Ctx = Context & AuthContext;

const mfaPatchSchema = t.Object({
  email: t.Optional(t.Object({
    sender: t.Optional(t.String(),),
    windowMs: t.Optional(t.Number(),),
  },),),
  messenger: t.Optional(t.Object({
    sender: t.Optional(t.String(),),
    botToken: t.Optional(t.String(),),
    windowMs: t.Optional(t.Number(),),
  },),),
},);

/** Standard 400 body for boundary validation failures. */
function invalid(message: string,): Response {
  return jsonError({ message, status: HttpStatus.BadRequest, code: ErrorCode.BadRequest, },);
}

/**
 * Snapshot of both channels' non-secret settings.
 * @param opts Database handle and app config.
 * @returns The exact shape served by GET and returned after PATCH.
 */
async function readConfig(opts: AdminRouteOpts,) {
  const emailSender = await readMfaEmailSender({ database: opts.database, },);
  const emailWindowMs = await readMfaEmailWindowMs({ database: opts.database, },);
  const messengerSender = await readMfaMessengerSender({ database: opts.database, },);
  const messengerWindowMs = await readMfaMessengerWindowMs({ database: opts.database, },);
  const botToken = await readMfaMessengerBotToken({ database: opts.database, },);
  const senderOverride = await getConfigValue(opts.database, MFA_EMAIL_SENDER_KEY,);

  return {
    email: {
      sender: emailSender,
      windowMs: emailWindowMs,
      configured: Boolean(senderOverride?.trim(),),
    },
    messenger: {
      sender: messengerSender,
      windowMs: messengerWindowMs,
      tokenConfigured: botToken !== undefined,
    },
  };
}

/**
 * Admin MFA config routes.
 * @param opts Shared admin route options (database + config).
 * @param prefix Route prefix; the v1 surface passes "/api/v1".
 * @returns The Elysia plugin exposing GET/PATCH of the MFA config.
 */
export function mfaConfigRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-mfa-config", },)
      .get(`${prefix}/admin/mfa/config`, async (ctx,) => {
        return withPermissionAuth(
          ctx as unknown as Ctx,
          "admin.system",
          async () => Response.json(await readConfig(opts,),),
        );
      },)
      .patch(`${prefix}/admin/mfa/config`, async (ctx,) => {
        const body = ctx.body;
        return withPermissionAuth(ctx as unknown as Ctx, "admin.system", async () => {
          const email = body.email;
          const messenger = body.messenger;

          if (email?.sender !== undefined && email.sender.trim() === "") {
            return invalid("email.sender must not be empty",);
          }

          if (email?.windowMs !== undefined && (!Number.isFinite(email.windowMs,) || email.windowMs <= 0)) {
            return invalid("email.windowMs must be a positive number",);
          }

          if (messenger?.sender !== undefined && messenger.sender.trim() === "") {
            return invalid("messenger.sender must not be empty",);
          }

          if (messenger?.botToken !== undefined && messenger.botToken.trim() === "") {
            return invalid("messenger.botToken must not be empty",);
          }

          if (messenger?.windowMs !== undefined && (!Number.isFinite(messenger.windowMs,) || messenger.windowMs <= 0)) {
            return invalid("messenger.windowMs must be a positive number",);
          }

          if (email?.sender !== undefined) {
            await saveMfaEmailSender({ database: opts.database, sender: email.sender, },);
          }

          if (email?.windowMs !== undefined) {
            await saveMfaEmailWindowMs({ database: opts.database, windowMs: email.windowMs, },);
          }

          if (messenger?.sender !== undefined) {
            await saveMfaMessengerSender({ database: opts.database, sender: messenger.sender, },);
          }

          if (messenger?.botToken !== undefined) {
            await saveMfaMessengerBotToken({ database: opts.database, token: messenger.botToken, },);
          }

          if (messenger?.windowMs !== undefined) {
            await saveMfaMessengerWindowMs({ database: opts.database, windowMs: messenger.windowMs, },);
          }

          return Response.json(await readConfig(opts,),);
        },);
      }, { body: mfaPatchSchema, },)
  );
}
