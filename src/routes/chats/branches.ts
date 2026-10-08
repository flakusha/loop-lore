// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat branching routes (FEAT-045 fork/switch/list, FEAT-046 navigation).
 *
 *   POST   /chats/:chatId/fork             → create branch at message
 *   POST   /chats/:chatId/branches         → create branch (alias of /fork)
 *   PATCH  /chats/:chatId/active-branch    → switch active branch
 *   GET    /chats/:chatId/branches         → cursor-paginated branch list
 *
 * The CRUD half (detail / rename / delete / merge) is mounted from
 * `./branch-crud` inside this same factory, so the barrel keeps one entry
 * point while both halves stay under the size gate.
 *
 * Ownership is derived from the session user (via `requireUserId`), never
 * from the body — a non-participant cannot spoof an actorId to pass the
 * service-layer `checkChatAccess` guard.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { listBranchesPage, } from "../../chat/service/branch-list";
import { forkBranch, switchActiveBranch, } from "../../chat/service/branches";
import type { DB, } from "../../db/schema";
import { HttpStatus, jsonCreated, jsonError, } from "../http-utils";
import { branchCrudRoutes, } from "./branch-crud";
import { branchMergeRoutes, } from "./branch-merges";
import {
  BranchListQuery,
  BranchName,
  branchRoute,
  ChatIdParams,
} from "./branch-shared";
import type { HandlerOpts, } from "./types";

const forkBody = t.Object({
  messageId: t.String(),
  name: t.Optional(BranchName,),
},);

const switchBody = t.Object({ branchId: t.String(), },);

/**
 * @param opts
 * @param prefix
 * @returns {Elysia}
 */
export function chatBranchRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const fork = handleFork(database,);
  return new Elysia({ name: "chats-branches", },)
    .post(`${prefix}/chats/:id/fork`, fork, { params: ChatIdParams.params, body: forkBody, },)
    // Alias: FEAT-046 names `POST /chats/:id/branches` as the create verb. Same
    // handler and body schema — one implementation behind two paths.
    .post(`${prefix}/chats/:id/branches`, fork, { params: ChatIdParams.params, body: forkBody, },)
    .patch(
      `${prefix}/chats/:id/active-branch`,
      handleSwitch(database,),
      { params: ChatIdParams.params, body: switchBody, },
    )
    .get(`${prefix}/chats/:id/branches`, handleList(database,), {
      params: ChatIdParams.params,
      query: BranchListQuery,
    },)
    .use(branchCrudRoutes(opts, prefix,),)
    .use(branchMergeRoutes(opts, prefix,),);
}

/**
 * POST /chats/:id/fork and its `/chats/:id/branches` alias.
 * @param database
 */
function handleFork(database: Kysely<DB>,) {
  return branchRoute(
    ({ id: chatId, }, actorId, ctx,) => {
      const body = ctx.body as { messageId: string; name?: string };
      return forkBranch(database, {
        chatId,
        messageId: body.messageId,
        actorId,
        name: body.name,
      },);
    },
    (result,) => jsonCreated({ data: result, },),
  );
}

/**
 * PATCH /chats/:id/active-branch
 * @param database
 */
function handleSwitch(database: Kysely<DB>,) {
  return branchRoute(({ id: chatId, }, actorId, ctx,) => {
    const body = ctx.body as { branchId: string };
    return switchActiveBranch(database, {
      chatId,
      branchId: body.branchId,
      actorId,
    },);
  },);
}

/**
 * GET /chats/:id/branches — keyset-paginated, `?limit` + `?cursor`.
 * @param database
 */
function handleList(database: Kysely<DB>,) {
  return branchRoute(async ({ id: chatId, }, actorId, ctx,) => {
    const query = (ctx.query ?? {}) as { limit?: string; cursor?: string };

    // A malformed `limit` is a 400, not a silent fall back to the default.
    let limit: number | undefined;
    if (query.limit !== undefined && query.limit !== "") {
      if (!/^\d+$/.test(query.limit,) || Number.parseInt(query.limit, 10,) < 1) {
        return jsonError("limit must be a positive integer", HttpStatus.BadRequest,);
      }

      limit = Number.parseInt(query.limit, 10,);
    }

    return listBranchesPage(database, {
      chatId,
      actorId,
      limit,
      cursor: query.cursor,
    },);
  },);
}
