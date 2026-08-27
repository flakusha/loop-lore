// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * V1 API routes barrel.
 *
 * Mounts all route plugins under `/api/v1/` using the `prefix` parameter.
 * Each route factory accepts an optional `prefix` parameter (default `/api`).
 * Here we pass `prefix = "/api/v1"` so routes register under `/api/v1/...`.
 *
 * Uses `.use()` (not `.mount()`) so Elysia's `.derive()` context (userId,
 * userRole, etc.) propagates correctly to all child routes.
 *
 * @see docs/spec/api-versioning.md
 */
import { Elysia, } from "elysia";
import { chatsRoutes, } from "../chats";
import { healthRoutes, } from "../health";
import { versionResolver, } from "../middleware/version-resolver";
import { requestStatusRoutes, } from "../requests";
import { usersRoutes, } from "../users";

import type { RegisterPluginsOpts, } from "../../app/register-plugins";

/**
 * Create v1 versioned routes.
 *
 * All route plugins are called with `prefix = "/api/v1"` so they register
 * their routes under `/api/v1/...` instead of the default `/api/...`.
 */
export function v1Routes(opts: RegisterPluginsOpts,) {
  const { database, config, } = opts;
  const handleOpts = { database, config, };
  const prefix = "/api/v1";

  return (
    new Elysia({ name: "v1", },)
      .use(versionResolver(),)
      .use(healthRoutes(handleOpts, prefix,),)
      .use(chatsRoutes(handleOpts, prefix,),)
      .use(usersRoutes(handleOpts, prefix,),)
      .use(requestStatusRoutes({ asyncStore: opts.asyncStore, }, prefix,),)
  );
}
