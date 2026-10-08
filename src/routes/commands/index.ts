// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Command Registry Routes
 *
 * Exposes the live command registry to the frontend so the command palette
 * (FE `command-palette.ts`) can hydrate from a single source of truth
 * instead of a hardcoded list that drifts from the BE as new commands are
 * added (WIRE-assistant-command-palette-stale-static-list).
 *
 * Each entry returns a `descriptionKey` pointing at the existing
 * `commands.<name>` i18n catalog so the FE can localize the description
 * without the BE having to load locale catalogs per request.
 *
 * The endpoint is auth-gated like the rest of the assistant surface; it
 * requires the calling user. Without `chatId` it surfaces no per-user
 * data; with `chatId` it additionally returns the caller's `roleInChat`.
 * `requiredRole` is display-only: the slash dispatch gate in
 * `src/routes/messages/command.ts` remains the enforcement authority.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { getCommandRequirement, listCommands, } from "../../assistant/commands/registry";
import { type DB, getDatabase, } from "../../db/index";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas/primitives";
import { requireUserId, } from "../http-utils";
import { fetchChatAndRole, } from "../messages/command";

interface CommandDescriptor {
  name: string;

  descriptionKey: string;
  /** Minimum participant role, when the registry pins one (display-only). */

  requiredRole?: string;
}

/**
 * @param opts
 * @param opts.prefix
 * @param opts.database - Kysely handle for the chatId role lookup; falls back to getDatabase()
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { commands: { get: { body: unknown; params: {}; query: unknown; headers: unknown; response: { ...; }; }; }; }; }, { ....}
 */
export function commandsRoutes(opts: { prefix?: string; database?: Kysely<DB> },) {
  const prefix = opts.prefix ?? "/api";
  const database = opts.database;
  return new Elysia({ name: "commands", },)
    .get(
      `${prefix}/commands`,
      async (ctx,) => {
        const userId = requireUserId(ctx as unknown as Parameters<typeof requireUserId>[0],);
        if (typeof userId !== "string") { return userId; }
        const chatId = typeof (ctx.query as { chatId?: unknown } | undefined)?.chatId === "string"
          ? (ctx.query as { chatId: string }).chatId
          : undefined;

        const data: CommandDescriptor[] = listCommands().map((name,) => ({
          name,
          descriptionKey: `commands.${name}`,
          requiredRole: getCommandRequirement(name,),
        }));

        // Chat-scoped display hint only: the slash dispatch gate stays the
        // enforcement authority. Unknown chat/role fails open (no filtering).
        if (chatId) {
          try {
            const db = database ?? getDatabase();
            const { chat, role, } = await fetchChatAndRole(db, chatId, userId,);
            // Unknown chat: fail open with the unscoped list (display-only).
            if (!chat) { return Response.json({ data, },); }
            const scoped: CommandDescriptor[] = data.map((entry,) => {
              const requiredRole = getCommandRequirement(entry.name,);
              return requiredRole ? { ...entry, requiredRole, } : entry;
            },);

            return Response.json({ data: scoped, roleInChat: role, },);
          } catch {
            return Response.json({ data, },);
          }
        }

        return Response.json({ data, },);
      },
      {
        query: t.Object({ chatId: t.Optional(t.String(),), },),
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
        },
        detail: {
          summary: "List registered chat commands",
          description: "Returns the live command registry the assistant exposes to chat clients.",
          tags: ["Assistant", "Commands",],
        },
      },
    );
}
