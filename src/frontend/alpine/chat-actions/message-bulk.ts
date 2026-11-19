// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Message multi-select + bulk actions. The reducer is pure so selection
 * semantics (toggle, shift-range, select-all, clear) can be unit-tested
 * without Alpine. Network actions mirror the gallery batch pattern: the
 * server re-checks authorization per id and reports partial failures.
 */
import { showToast, } from "../../ui";
import type {
  MessageBulkExportFormat,
  MessageBulkSelection,
  MessageBulkState,
} from "../chat-types/message-bulk-state";
import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import type { ChatState, } from "../types";

interface BulkResult {
  ok: boolean;
  succeeded: string[];
  failed: { id: string; reason: string }[];
}

/**
 * Pure selection reducer. Shift-click with an anchor selects the inclusive
 * range in visible order; a plain click toggles one id and moves the anchor.
 * @param selection
 * @param messageId
 * @param visibleIds
 * @param shiftKey
 */
export function reduceMessageSelection(
  selection: MessageBulkSelection,
  messageId: string,
  visibleIds: readonly string[],
  shiftKey = false,
): MessageBulkSelection {
  if (!messageId) { return selection; }

  const selected = new Set(selection.selectedMessageIds,);
  if (shiftKey && selection.anchorId) {
    const from = visibleIds.indexOf(selection.anchorId,);
    const to = visibleIds.indexOf(messageId,);
    if (from >= 0 && to >= 0) {
      const [lo, hi,] = from <= to ? [from, to,] : [to, from,];
      for (const id of visibleIds.slice(lo, hi + 1,)) { selected.add(id,); }
      return { selectedMessageIds: [...selected,], anchorId: selection.anchorId, };
    }
  }

  if (selected.has(messageId,)) { selected.delete(messageId,); }
  else { selected.add(messageId,); }

  return { selectedMessageIds: [...selected,], anchorId: messageId, };
}

type MessageBulkCtx = ChatState & MessageBulkState;

/**
 * @param result
 * @param successKey
 */
function reportBulkResult(result: BulkResult, successKey: string,): void {
  if (result.failed.length > 0) {
    showToast("error", `${t(successKey,)}: ${t("chats.bulkPartialFailure",)} (${result.failed.length},)`,);
  } else {
    showToast("success", t(successKey,),);
  }
}

export const messageBulk: Partial<MessageBulkState> & ThisType<MessageBulkCtx> = {
  selectedMessageIds: [] as string[],
  _messageSelectionAnchorId: null as string | null,
  _bulkActionBusy: false,
  _bulkTargetSectionId: "",

  toggleMessageSelection(messageId, shiftKey = false,) {
    const visibleIds = (this.groupedMessages ?? []).map((m,) => m.id);
    const next = reduceMessageSelection(
      {
        selectedMessageIds: this.selectedMessageIds,
        anchorId: this._messageSelectionAnchorId,
      },
      messageId,
      visibleIds,
      shiftKey,
    );

    const enteredSelection = this.selectedMessageIds.length === 0 && next.selectedMessageIds.length > 0;
    this.selectedMessageIds = next.selectedMessageIds;
    this._messageSelectionAnchorId = next.anchorId;
    if (enteredSelection && this._sections?.length === 0) { void this.loadSections(); }
  },

  selectAllVisibleMessages() {
    this.selectedMessageIds = [...new Set((this.groupedMessages ?? []).map((m,) => m.id),),];
  },

  clearMessageSelection() {
    this.selectedMessageIds = [];
    this._messageSelectionAnchorId = null;
  },

  async bulkDeleteSelectedMessages(hard = false,) {
    const chatId = this.activeChat;
    const ids = [...this.selectedMessageIds,];
    if (!chatId || ids.length === 0 || this._bulkActionBusy) { return; }
    if (!window.confirm(t("chats.bulkDeleteConfirm",),)) { return; }

    this._bulkActionBusy = true;
    try {
      const res = await apiFetch(`/api/v1/chats/${chatId}/messages/bulk/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ ids, hard, },),
      },);

      const result = await res.json() as BulkResult;
      // Optimistic UI: drop only ids the server actually removed. Failures
      // stay visible in the timeline so the user can retry them.
      const removed = new Set(result.succeeded,);
      this.messages = this.messages.filter((m,) => !removed.has(m.id,));
      reportBulkResult(result, "chats.bulkDeleteDone",);
      this.clearMessageSelection();
    } catch {
      showToast("error", t("toasts.networkError",),);
    } finally {
      this._bulkActionBusy = false;
    }
  },

  async bulkMoveSelectedMessages(sectionId,) {
    const chatId = this.activeChat;
    const ids = [...this.selectedMessageIds,];
    if (!chatId || ids.length === 0 || this._bulkActionBusy) { return; }

    this._bulkActionBusy = true;
    try {
      const res = await apiFetch(`/api/v1/chats/${chatId}/messages/bulk/section`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ ids, sectionId, },),
      },);

      const result = await res.json() as BulkResult;
      reportBulkResult(result, "chats.bulkMoveDone",);
      this.clearMessageSelection();
    } catch {
      showToast("error", t("toasts.networkError",),);
    } finally {
      this._bulkActionBusy = false;
    }
  },

  async exportSelectedMessages(format: MessageBulkExportFormat,) {
    const chatId = this.activeChat;
    const ids = [...this.selectedMessageIds,];
    if (!chatId || ids.length === 0 || this._bulkActionBusy) { return; }

    this._bulkActionBusy = true;
    try {
      const res = await apiFetch(`/api/v1/chats/${chatId}/messages/bulk/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ ids, format, },),
      },);

      const disposition = res.headers.get("Content-Disposition",) ?? "";
      const match = /filename="?([^";]+)"?/.exec(disposition,);
      const blob = new Blob([await res.blob(),], {
        type: format === "json" ? "application/json" : "text/markdown",
      },);

      const url = URL.createObjectURL(blob,);
      const a = document.createElement("a",);
      a.href = url;
      a.download = match?.[1] ?? `selection.${format}`;
      a.click();
      URL.revokeObjectURL(url,);
      this.clearMessageSelection();
    } catch {
      showToast("error", t("toasts.networkError",),);
    } finally {
      this._bulkActionBusy = false;
    }
  },
};
