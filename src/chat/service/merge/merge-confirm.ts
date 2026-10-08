// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Confirm orchestration for content merges (FEA-2026-047). Single
 * transaction with throw-to-rollback via MergeTxAbort.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../../config/schema";
import type { DB, } from "../../../db/schema";
import { emitPluginEvent, } from "../../../plugins/event-bus";
import { registry, } from "../../../plugins/registry";
import { prepareContentStorage, } from "../../../routes/messages/post";
import { uid, } from "../../../utils";
import { checkChatAccess, } from "../access";
import { nextAutoName, } from "../branch-helpers";
import type { MergeConflictChoice, MergeError, } from "./merge-criteria";
import type { MergeHunk, } from "./merge-diff";
import { applyHunks, } from "./merge-overlay";
import { parseMetadata, } from "./merge-render";
import { insertResultRows, } from "./merge-result-rows";
import { finalizeMergeRow, guardDraftToConfirmed, loadMerge, } from "./merge-store";

/** Aborts a merge transaction (throw-to-rollback). */
export class MergeTxAbort extends Error {
  constructor(readonly error: MergeError,) {
    super(error.message,);
    this.name = "MergeTxAbort";
  }
}

/** Options for {@link confirmMerge}. */
export interface ConfirmMergeOptions {
  database: Kysely<DB>;
  config: Config;
  params: {
    chatId: string;
    mergeId: string;
    actorId: string;
    userRole: string | null;
    content?: { role: string; content: string }[];
    conflictChoices?: MergeConflictChoice[];
    branchName?: string;
    activate?: boolean;
  };
}

/** Result of {@link confirmMerge}. */
export type ConfirmMergeResult =
  | { ok: true; mergeId: string; resultMessageIds: string[]; mergedBranchId: string; activeBranchId: string }
  | MergeError;

/**
 * Confirm a content merge: guarded status transition, insert result rows,
 * create synthetic branch, optionally activate, emit plugin event.
 * All in one transaction (throw-to-rollback via MergeTxAbort).
 * @param options
 * @throws {MergeTxAbort} when the transaction must roll back
 * @throws {Error} when the DB driver fails
 * @returns {Promise<ConfirmMergeResult>}
 */
export async function confirmMerge(options: ConfirmMergeOptions,): Promise<ConfirmMergeResult> {
  const { database, config, params, } = options;
  const { chatId, mergeId, actorId, userRole, content, conflictChoices, branchName, activate = true, } = params;

  const access = await checkChatAccess(database, chatId, actorId, userRole,);
  if (!access.ok) { return access.error; }

  const merge = await loadMerge(database, mergeId,);
  if (!merge || merge.chat_id !== chatId) {
    return { code: "not_found", message: "Merge not found", };
  }

  const metadata = parseMetadata(merge.metadata,);
  const confirmedAt = new Date().toISOString();

  let capturedResultMessageIds: string[] = [];
  let capturedMergedBranchId = "";
  let capturedActiveBranchId = "";

  try {
    await database.transaction().execute(async (trx,) => {
      // 1. Guarded status transition
      const updated = await guardDraftToConfirmed(trx, { mergeId, confirmedAt, },);
      if (updated === 0) {
        throw new MergeTxAbort({ code: "conflict", message: "Merge already confirmed", },);
      }

      // 2. Resolve final content
      const finalContent = await resolveFinalContent(metadata, content, conflictChoices,);
      if (!finalContent) {
        throw new MergeTxAbort({ code: "bad_request", message: "No content to confirm", },);
      }

      // 3. Insert result rows
      const resultRows = [];
      for (const [ordinal, msg,] of finalContent.entries()) {
        const stored = await prepareContentStorage(trx, config, chatId, actorId, msg.content,);
        resultRows.push({
          ordinal,
          role: msg.role,
          storedContent: stored.storedContent,
          storedKeyId: stored.storedKeyId,
          storedPlaintext: stored.storedPlaintext,
          contentEncoding: stored.contentEncoding,
        },);
      }

      const resultMessageIds = await insertResultRows(trx, {
        chatId,
        baseMessageId: merge.base_message_id,
        mergeId,
        actorId,
        rows: resultRows,
      },);

      // 4. Create synthetic branch
      const mergedTipId = resultMessageIds[resultMessageIds.length - 1]!;
      const name = branchName ?? await nextAutoName(trx, chatId,);
      const branchId = uid();

      await trx
        .insertInto("chat_branches",)
        .values({
          id: branchId,
          chat_id: chatId,
          parent_message_id: mergedTipId,
          name,
          is_active: activate ? 1 : 0,
        },)
        .execute();

      // 5. Activate: demote others + repoint
      if (activate) {
        await trx
          .updateTable("chats",)
          .set({ active_branch_id: branchId, },)
          .where("id", "=", chatId,)
          .execute();

        await trx
          .updateTable("chat_branches",)
          .set({ is_active: 0, },)
          .where("chat_id", "=", chatId,)
          .where("is_active", "=", 1,)
          .where("id", "!=", branchId,)
          .execute();
      }

      // 6. Finalise merge row
      await finalizeMergeRow(trx, {
        mergeId,
        resultMessageId: mergedTipId,
        mergedBranchId: branchId,
        confirmedAt,
      },);

      // 7. Emit plugin event
      await emitPluginEvent(
        registry.getAllEventHandlers(),
        "message.merged",
        { chatId, mergeId, baseMessageId: merge.base_message_id, resultMessageIds, mergedBranchId: branchId, },
      );

      capturedResultMessageIds = resultMessageIds;
      capturedMergedBranchId = branchId;
      capturedActiveBranchId = activate ? branchId : "";
    },);
  } catch (error) {
    if (error instanceof MergeTxAbort) { return error.error; }
    throw error;
  }

  return {
    ok: true,
    mergeId,
    resultMessageIds: capturedResultMessageIds,
    mergedBranchId: capturedMergedBranchId,
    activeBranchId: capturedActiveBranchId,
  };
}

/**
 * Resolve the final content from preview + user input.
 * @param metadata
 * @param metadata.preview
 * @param metadata.preview.kind
 * @param metadata.preview.draft
 * @param metadata.preview.hunks
 * @param content
 * @param conflictChoices
 */
async function resolveFinalContent(
  metadata: { preview?: { kind: "llm" | "overlay"; draft?: { role: string; content: string }[]; hunks?: MergeHunk[] } },
  content: { role: string; content: string }[] | undefined,
  conflictChoices: MergeConflictChoice[] | undefined,
): Promise<{ role: string; content: string }[] | null> {
  if (content) { return content; }

  const preview = metadata.preview;
  if (!preview) { return null; }

  if (preview.kind === "llm") {
    return preview.draft ?? null;
  }

  // Overlay mode: apply conflict choices to hunks
  const hunks = preview.hunks;
  if (!hunks) { return null; }

  const hasConflicts = hunks.some((h,) => h.status === "conflict");
  if (hasConflicts && !conflictChoices) { return null; }

  const resolutions = new Map<number, "base" | "overlay">();
  for (const choice of conflictChoices ?? []) {
    if (choice.resolution !== "manual") {
      resolutions.set(choice.hunkIndex, choice.resolution,);
    }
  }

  const lines = applyHunks(hunks, resolutions,);
  if (!lines) { return null; }

  return [{ role: "assistant", content: lines.join("\n",), },];
}
