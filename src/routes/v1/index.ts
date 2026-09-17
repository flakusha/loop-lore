// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * V1 API routes barrel.
 *
 * Five per-section barrels (one Elysia chain each) keep every chain shallow
 * enough for the typechecker -- a single chain of this size exceeds
 * TypeScript's instantiation depth (TS2589 in the typecheck gate).
 * Route order is unchanged from the original single chain.
 *
 * Uses `.use()` (not `.mount()`) so Elysia's `.derive()` context (userId,
 * userRole, etc.) propagates correctly to all child routes.
 *
 * Deliberately NOT versioned (mounted only unversioned by
 * `register-plugins.ts`):
 * - `livenessRoutes` / `metricsRoutes` - infra probes (`/health/*`, `/metrics`)
 * - `federationRoutes` - NodeInfo + mesh peer protocol (spec-fixed paths)
 * - `viewRoutes` - server-rendered HTML under `/views/*`, not a JSON API
 * @see docs/spec/api-versioning.md
 */
import { Elysia, } from "elysia";
import type { RegisterPluginsOpts, } from "../../app/register-plugins";
import { deprecationAfterHandle, } from "../middleware/deprecation-headers";
import { versionResolver, } from "../middleware/version-resolver";
import { actorsSurface, } from "./actors-surface";
import { adminSurface, } from "./admin-surface";
import { baseSurface, } from "./base-surface";
import { chatsSurface, } from "./chats-surface";
import { contentSurface, } from "./content-surface";

/**
 * Create v1 versioned routes.
 *
 * All route plugins are called with `prefix = "/api/v1"` so they register
 * their routes under `/api/v1/...` instead of the default `/api/...`.
 * @param opts
 */
export function v1Routes(opts: RegisterPluginsOpts,) {
  return new Elysia({ name: "v1", },)
    // MUST be registered BEFORE the route plugins: Elysia's onAfterHandle
    // only wraps routes declared after the hook (proven by probe test).
    .onAfterHandle(
      deprecationAfterHandle({
        enabled: () => process.env.API_V1_DEPRECATED === "1",
        deprecatedVersion: "1",
        successorVersion: "2",
        sunset: "Sat, 01 Jan 2028 00:00:00 GMT",
      },),
    )
    .use(versionResolver(),)
    .use(baseSurface(opts,),)
    .use(chatsSurface(opts,),)
    .use(actorsSurface(opts,),)
    .use(contentSurface(opts,),)
    .use(adminSurface(opts,),);
}
