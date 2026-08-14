/**
 * User Routes
 *
 *   GET  /api/users/me       — current user profile
 *   PUT  /api/users/me       — update own profile
 *   GET  /api/users/:id      — get user by ID (admin or self)
 *   PUT  /api/users/:id      — update user (admin or self)
 *   DELETE /api/users/:id    — delete user (admin only)
 *   PUT  /api/users/:id/settings   — update user settings
 *
 * Barrel facade — registration point/name (`users`) preserved so the
 * `elysia-app.ts` wiring is unchanged.
 */
import { Elysia, } from "elysia";
import { manageRoutes, } from "./manage";
import { meRoutes, } from "./me";
import type { UsersRoutesOpts, } from "./types";

export type { UsersRoutesOpts, } from "./types";

export function usersRoutes(opts: UsersRoutesOpts, prefix = "/api",): Elysia {
  return new Elysia({ name: "users", },)
    .use(meRoutes(opts, prefix,),)
    .use(manageRoutes(opts, prefix,),);
}
