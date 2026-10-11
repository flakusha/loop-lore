// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin carriage route — the only read path for the carriage channel.
 *
 * Carriage records (cross-context state carried between sections, parties,
 * and sessions) are visible to admins and developers only; no
 * chat-scoped/participant-facing route selects from `carriage_records`
 * (TASK-chat-feature-notes-shadow-carriage AC3).
 */
import { Elysia, t, } from "elysia";
import { fetchUnrevealedShadowNotes, } from "../../assistant/prompt/sections/gm-notes";
import { listCarriage, } from "../../chat/service/carriage";
import type { GmConfig, } from "../../chat/types/config";
import { can, } from "../../users/permissions";
import { safeJsonParse, } from "../../utils/safe-json";
import { healCarriage, } from "../../utils/structured-output";
import { ChatIdParams, ErrorResponse, } from "../../validation/schemas";
import { forbiddenResponse, jsonResponse, notFoundResponse, requireUserId, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/**
 * Heal verdict for the debug view — the `healCarriage` outcome for the
 * latest scope=`carriage` payload, minus the parsed doc value.
 */
export type CarriageDebugVerdict =
  | { ok: true; healed: boolean; hash: string }
  | { ok: false; reason: string; hint: string };

/**
 * Admin-only carriage read paths — the sole routes that select from
 * `carriage_records` (carriage AC3). Unknown chats 404. The second route is
 * the dev/debug `?` view (TASK-shadow-visibility-debug-assistant): toggle
 * state, the latest scope=`carriage` record, its heal verdict, and every
 * unrevealed shadow note labeled `visibility: "gm"`.
 * @param opts
 * @param prefix
 */
export function carriageRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  const app = new Elysia({ name: "admin-carriage", },);
  app.get(
    `${prefix}/admin/chats/:id/carriage`,
    async (ctx: any,) => {
      const callerId = requireUserId(ctx,);
      if (typeof callerId !== "string") { return callerId; }
      if (!can(ctx.userRole, "admin.system",)) { return forbiddenResponse(); }
      const { id, } = ctx.params as { id: string };
      const chat = await opts.database.selectFrom("chats",).select("id",).where("id", "=", id,).executeTakeFirst();
      if (!chat) { return notFoundResponse(); }
      const records = await listCarriage(opts.database, id,);
      return jsonResponse({ data: records, },);
    },
    {
      params: ChatIdParams,
      response: { 200: t.Any(), 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
    },
  );

  app.get(
    `${prefix}/admin/chats/:id/carriage/debug`,
    async (ctx: any,) => {
      const callerId = requireUserId(ctx,);
      if (typeof callerId !== "string") { return callerId; }
      if (!can(ctx.userRole, "admin.system",)) { return forbiddenResponse(); }
      const { id, } = ctx.params as { id: string };
      const chat = await opts.database
        .selectFrom("chats",)
        .select(["id", "gm_config",],)
        .where("id", "=", id,)
        .executeTakeFirst();

      if (!chat) { return notFoundResponse(); }

      const gmConfig = safeJsonParse<GmConfig>(chat.gm_config ?? "",);
      const carriageEnabled = gmConfig.ok && gmConfig.value.carriageEnabled === true;

      const latest = (await listCarriage(opts.database, id, { limit: 1, scope: "carriage", },))[0] ?? null;

      let verdict: CarriageDebugVerdict | null = null;
      if (latest) {
        const payload = safeJsonParse<{ toml?: unknown }>(latest.payload,);
        if (payload.ok && typeof payload.value.toml === "string") {
          const healing = healCarriage(payload.value.toml,);
          verdict = healing.ok
            ? { ok: true, healed: healing.healed, hash: healing.hash, }
            : { ok: false, reason: healing.reason, hint: healing.hint, };
        }
      }

      // Every shadow entry carries its gm label here — this is the one
      // dev-only surface allowed to read the hidden-note set directly.
      const shadowNotes = Array.from(
        await fetchUnrevealedShadowNotes(opts.database, id,),
        (note, i,) => ({
          id: `shadow-${i}`,
          type: note.type,
          content: note.content,
          visibility: "gm" as const,
        }),
      );

      return jsonResponse({
        data: { chatId: id, carriageEnabled, latest, verdict, shadowNotes, },
      },);
    },
    {
      params: ChatIdParams,
      response: { 200: t.Any(), 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
    },
  );

  return app;
}
