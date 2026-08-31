// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation Routes
 *
 * REST endpoints for NSFW moderation safety infrastructure.
 *
 * Barrel facade — registration point/name (`nsfw-moderation`) preserved so the
 * `elysia-app.ts` wiring is unchanged.
 */
import { Elysia, } from "elysia";
import { actionsRoutes, } from "./actions";
import { appealsRoutes, } from "./appeals";
import { auditRoutes, } from "./audit";
import { flagsRoutes, } from "./flags";
import { overridesRoutes, } from "./overrides";
import { preferencesRoutes, } from "./preferences";
import type { HandlerOpts, } from "./types";

export type { HandlerOpts, } from "./types";

/**
 * @param opts
 */
export function nsfwModerationRoutes(opts: HandlerOpts,) {
  return new Elysia({ name: "nsfw-moderation", },)
    .use(preferencesRoutes(opts,),)
    .use(actionsRoutes(opts,),)
    .use(flagsRoutes(opts,),)
    .use(auditRoutes(opts,),)
    .use(overridesRoutes(opts,),)
    .use(appealsRoutes(opts,),);
}
