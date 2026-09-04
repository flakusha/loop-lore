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
 * requires the calling user but does not surface any per-user data.
 */
import { Elysia, } from "elysia";
import { listCommands, } from "../../assistant/commands/registry";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas/primitives";
import { requireUserId, } from "../http-utils";

interface CommandDescriptor {
  name: string;
  descriptionKey: string;
}

/**
 * @param opts
 * @param opts.prefix
 */
export function commandsRoutes(opts: { prefix?: string },) {
  const prefix = opts.prefix ?? "/api";
  return new Elysia({ name: "commands", },)
    .get(
      `${prefix}/commands`,
      async (ctx,) => {
        const userId = requireUserId(ctx as unknown as Parameters<typeof requireUserId>[0],);
        if (typeof userId !== "string") { return userId; }
        const data: CommandDescriptor[] = listCommands().map((name,) => ({
          name,
          descriptionKey: `commands.${name}`,
        }));
        return Response.json({ data, },);
      },
      {
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
