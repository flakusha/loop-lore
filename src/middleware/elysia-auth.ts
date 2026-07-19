/**
 * Elysia Auth Guard Plugin
 *
 * NOTE: Auth logic moved inline to elysia-app.ts for proper context propagation.
 * Elysia .use() plugins don't share derived values with child route plugins.
 * This export is kept for backward compatibility and unit tests.
 */

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { authenticate, } from "./auth";

export interface AuthGuardDeps {
  database: Kysely<DB>;
  config: Config;
}

export function authGuard(deps: AuthGuardDeps,) {
  const { database, config, } = deps;

  return new Elysia({ name: "auth-guard", },).derive(async ({ request, },) => {
    const authResult = await authenticate({ request, database, authConfig: config.auth, },);
    if (authResult instanceof Response) {
      return { userId: null, userRole: null, sessionId: null, };
    }
    return {
      userId: authResult.context.userId,
      userRole: authResult.context.userRole,
      sessionId: authResult.context.sessionId,
    };
  },) as unknown as Elysia;
}
