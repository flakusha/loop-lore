// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Content-merge request bodies (FEA-2026-047).
 *
 * TypeBox bodies for the four `/chats/:id/branch-merges` endpoints, matching
 * design section 3.2. The `MergeMode` union is spelled literally here (not
 * imported) so the validation surface has no runtime dependency on the chat
 * service layer.
 */
import { t, } from "elysia";

/** Longest branch name accepted; mirrors `MAX_BRANCH_NAME_LENGTH`. */
export const MERGE_BRANCH_NAME_MAX = 120;

/** The five content-merge strategies, persisted verbatim. */
export const MergeModeSchema = t.Union([
  t.Literal("combined",),
  t.Literal("second-over-first",),
  t.Literal("first-over-second",),
  t.Literal("fresh-discovery",),
  t.Literal("single-plus-glean",),
],);

/** One source tip in picker order (ordinal = array index). */
export const MergeSourceTipSchema = t.Object({
  tipMessageId: t.String({ minLength: 1, },),
  branchId: t.Optional(t.String({ minLength: 1, },),),
},);

/** `POST /chats/:id/branch-merges` body. */
export const BranchMergeInitiateBody = t.Object({
  mode: MergeModeSchema,
  sourceTips: t.Array(MergeSourceTipSchema, { minItems: 2, maxItems: 4, },),
  idempotencyKey: t.Optional(t.String({ minLength: 1, },),),
},);

/** `POST /chats/:id/branch-merges/:mergeId/preview` body. */
export const BranchMergePreviewBody = t.Object({
  regenerate: t.Optional(t.Boolean(),),
  styleHint: t.Optional(t.String({ maxLength: 500, },),),
},);

/** One output message the user is confirming. */
export const MergeContentEntrySchema = t.Object({
  role: t.String({ minLength: 1, },),
  content: t.String(),
},);

/** One per-hunk conflict resolution chosen by the user. */
export const MergeConflictChoiceSchema = t.Object({
  hunkIndex: t.Numeric(),
  resolution: t.Union([t.Literal("base",), t.Literal("overlay",), t.Literal("manual",),],),
},);

/** `POST /chats/:id/branch-merges/:mergeId/confirm` body. */
export const BranchMergeConfirmBody = t.Object({
  content: t.Optional(t.Array(MergeContentEntrySchema,),),
  conflictChoices: t.Optional(t.Array(MergeConflictChoiceSchema,),),
  branchName: t.Optional(t.String({
    minLength: 1,
    maxLength: MERGE_BRANCH_NAME_MAX,
    pattern: "^[^\\u0000-\\u001f\\u007f]*$",
  },),),
  activate: t.Optional(t.Boolean(),),
},);

/** `POST /chats/:id/branch-merges/:mergeId/continue` body. */
export const BranchMergeContinueBody = t.Object({
  prompt: t.Optional(t.String(),),
  actorId: t.Optional(t.String({ minLength: 1, },),),
},);

/** `:id` + `:mergeId` params for the preview/confirm/continue routes. */
export const BranchMergeParams = t.Object({
  id: t.String(),
  mergeId: t.String(),
},);
