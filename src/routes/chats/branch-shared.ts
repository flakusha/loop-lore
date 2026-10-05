// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared chat-branch route helpers (FEAT-045 / FEAT-046).
 *
 * Param schemas, the `branchRoute` handler wrapper, and the service-error →
 * HTTP status mapping, shared by `branches.ts` (fork/switch/list) and
 * `branch-crud.ts` (detail/rename/delete/merge) so both halves of the branch
 * surface speak the same shapes.
 */
import { type Context, t, } from "elysia";
import type { ServiceError, } from "../../chat/service/types";
import {
  HttpStatus,
  jsonError,
  jsonResponse,
  requireUserId,
} from "../http-utils";

/** `:id` only — fork, switch and list. */
export const ChatIdParams = { params: t.Object({ id: t.String(), },), } as const;

/** `:id` + `:branchId` — detail, rename, delete, merge. */
export const BranchParams = t.Object({
  id: t.String(),
  branchId: t.String(),
},);

/** Longest branch name accepted; keeps `chat_branches.name` bounded. */
export const MAX_BRANCH_NAME_LENGTH = 120;

/** List query: cursor-paginated, `limit` defaults server-side. */
export const BranchListQuery = t.Object({
  limit: t.Optional(t.String(),),
  cursor: t.Optional(t.String(),),
},);

/**
 * Branch name body field: non-empty, length-capped, and free of control
 * characters (null bytes and friends break log/JSON consumers).
 */
export const BranchName = t.String({
  minLength: 1,
  maxLength: MAX_BRANCH_NAME_LENGTH,
  pattern: "^[^\\u0000-\\u001f\\u007f]*$",
},);

/**
 * Map service errors to HTTP status.
 * @param code
 */
export function statusFor(
  code: string,
): (typeof HttpStatus)[keyof typeof HttpStatus] {
  if (code === "not_found") { return HttpStatus.NotFound; }
  if (code === "forbidden") { return HttpStatus.Forbidden; }
  return HttpStatus.BadRequest;
}

/** Path params of a `:id` + `:branchId` branch route. */
export type BranchRouteParams = { id: string; branchId: string };

/**
 * Wrap a branch route handler: session guard, path params, the shared
 * service-error → HTTP mapping, and the `{ data }` success envelope.
 *
 * `run` returns the service Result, or a ready-made `Response` to
 * short-circuit (e.g. a query-validation 400). `envelope` overrides the
 * default 200 `{ data }` body for create verbs, which answer 201.
 * @param run
 * @param envelope
 * @returns the Elysia handler
 */
export function branchRoute<P extends { id: string } = { id: string }, R extends object = object,>(
  run: (params: P, actorId: string, ctx: Context,) => Promise<R>,
  envelope: (payload: R,) => Response = (payload,) => jsonResponse({ data: payload, },),
) {
  return async (ctx: Context,) => {
    const userId = requireUserId(ctx,);
    if (typeof userId !== "string") { return userId; }
    const result = await run(ctx.params as P, userId, ctx,);
    if (result instanceof Response) { return result; }
    if ("code" in result) {
      // `R` is opaque here, so the discriminant is the only narrowing signal.
      const error = result as unknown as ServiceError;
      return jsonError(error.message, statusFor(error.code,), error.code as never,);
    }

    return envelope(result,);
  };
}
