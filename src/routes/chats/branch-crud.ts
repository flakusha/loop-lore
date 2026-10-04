// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat branch CRUD routes (FEAT-046).
 *
 *   GET    /chats/:id/branches/:branchId          → detail + message path
 *   PATCH  /chats/:id/branches/:branchId          → rename / activate
 *   DELETE /chats/:id/branches/:branchId          → delete (not active)
 *   POST   /chats/:id/branches/:branchId/merge    → merge into target
 *
 * Composed by `chatBranchRoutes` so the barrel keeps one mount point while
 * each file stays under the size gate.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import {
  deleteBranch,
  type DeleteBranchResult,
  getBranch,
  type GetBranchResult,
  renameBranch,
  type RenameBranchResult,
} from "../../chat/service/branch-crud";
import { mergeBranch, type MergeBranchResult, } from "../../chat/service/branch-merge";
import type { DB, } from "../../db/schema";
import {
  BranchName,
  BranchParams,
  branchRoute,
  type BranchRouteParams,
} from "./branch-shared";
import type { HandlerOpts, } from "./types";

// Both bodies are optional: a bare merge (no `intoBranchId`) merges into the
// chat's active branch, which is the documented default, and a bare PATCH is a
// valid no-op. Requiring a body would 422 the primary merge path.
const renameBody = t.Optional(t.Object({
  name: t.Optional(BranchName,),
  activate: t.Optional(t.Boolean(),),
},),);

const mergeBody = t.Optional(t.Object({
  intoBranchId: t.Optional(t.String(),),
},),);

/**
 * @param opts
 * @param prefix
 * @returns {Elysia}
 */
export function branchCrudRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  return new Elysia({ name: "chats-branches-crud", },)
    .get(`${prefix}/chats/:id/branches/:branchId`, handleDetail(database,), {
      params: BranchParams,
      detail: { summary: "Get chat branch detail", tags: ["Chats",], },
    },)
    .patch(`${prefix}/chats/:id/branches/:branchId`, handleRename(database,), {
      params: BranchParams,
      body: renameBody,
      detail: { summary: "Rename or activate a chat branch", tags: ["Chats",], },
    },)
    .delete(`${prefix}/chats/:id/branches/:branchId`, handleDelete(database,), {
      params: BranchParams,
      detail: { summary: "Delete a chat branch", tags: ["Chats",], },
    },)
    .post(`${prefix}/chats/:id/branches/:branchId/merge`, handleMerge(database,), {
      params: BranchParams,
      body: mergeBody,
      detail: { summary: "Merge a chat branch", tags: ["Chats",], },
    },);
}

/**
 * GET /chats/:id/branches/:branchId
 * @param database
 */
function handleDetail(database: Kysely<DB>,) {
  return branchRoute<BranchRouteParams, GetBranchResult>(
    ({ id: chatId, branchId, }, actorId,) => getBranch(database, { chatId, branchId, actorId, },),
  );
}

/** PATCH /chats/:id/branches/:branchId */

function handleRename(database: Kysely<DB>,) {
  return branchRoute<BranchRouteParams, RenameBranchResult>(
    ({ id: chatId, branchId, }, actorId, ctx,) => {
      const body = (ctx.body ?? {}) as { name?: string; activate?: boolean };
      return renameBranch(database, {
        chatId,
        branchId,
        actorId,
        name: body.name,
        activate: body.activate,
      },);
    },
  );
}

/**
 * DELETE /chats/:id/branches/:branchId
 * @param database
 */
function handleDelete(database: Kysely<DB>,) {
  return branchRoute<BranchRouteParams, DeleteBranchResult>(
    ({ id: chatId, branchId, }, actorId,) => deleteBranch(database, { chatId, branchId, actorId, },),
  );
}

/** POST /chats/:id/branches/:branchId/merge */

function handleMerge(database: Kysely<DB>,) {
  return branchRoute<BranchRouteParams, MergeBranchResult>(
    ({ id: chatId, branchId, }, actorId, ctx,) => {
      const body = (ctx.body ?? {}) as { intoBranchId?: string };
      return mergeBranch(database, {
        chatId,
        branchId,
        actorId,
        intoBranchId: body.intoBranchId,
      },);
    },
  );
}
