// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { getLogger, type Logger, } from "../../logger";
import { checkActorOwnership, } from "../actor-auth";
import { forbiddenResponse, requireUserId, } from "../http-utils";

/** */
function log(): Logger {
  return getLogger().child({ module: "nsfw-routes", },);
}

export { log, };

/**
 * Require the caller to own `targetActor` (or be admin/solo). Returns userId on success, else a Response.
 * @param database
 * @param targetActor
 * @param ctx
 */
export async function requireNsfwActorAccess(
  database: Kysely<DB>,
  targetActor: string,
  ctx: any,
): Promise<string | Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  const ok = await checkActorOwnership(database, targetActor, userId, (ctx.userRole as string | null) ?? null,);
  if (!ok) { return forbiddenResponse(); }
  return userId;
}
