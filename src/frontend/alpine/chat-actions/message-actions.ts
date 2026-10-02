// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Message action-row actions (TASK-chat-feature-component-buttons):
 * per-message `Improve` (user-authored messages) and `Attach` (any message)
 * affordances.
 *
 * Improve runs the shared prompt-improvement service over the message
 * content and persists the result with an in-place PATCH splice — the thread
 * is never reloaded, so scroll position is preserved (AC2). Attach opens the
 * asset picker, POSTs the chosen asset to `/messages/:id/attachments`, then
 * refetches that single message to refresh its enriched attachment rows.
 */
import type { GalleryAsset, MessageActionsState, } from "../chat-types/message-actions-state";
import type { Message, } from "../chat-types/messages";
import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import { log as rootLog, } from "../logger";
import type { ChatState, } from "../types";

const log = rootLog.child({ module: "chat", },);

/**
 * One selectable asset kind in the attach picker. The registry below is the
 * extensible slot (AC7): registering a new kind widens the picker without
 * touching the attach flow.
 */
export interface AssetPickerKind {
  /** Stable kind id (e.g. `"image"`, future `"audio"` / `"video"` / `"file"`). */
  kind: string;
  /** Human label for kind headers/aria. */
  label: string;
  /** True when the gallery row belongs to this kind. */
  matches: (asset: GalleryAsset,) => boolean;
}

/**
 * Registered picker kinds. Images ship first; future kinds (audio/video/file)
 * register here and appear in the picker automatically (AC7).
 */
export const ASSET_PICKER_KINDS: AssetPickerKind[] = [
  {
    kind: "image",
    label: "Images",
    matches: (asset,) => asset.type === "image" || (asset.mime_type?.startsWith("image/",) ?? false),
  },
];

/**
 * Filter gallery rows down to assets accepted by at least one registered
 * kind. Exposed for tests that prove registry extensibility.
 * @param assets - Raw gallery rows from `GET /api/v1/assets`
 * @param kinds - Kind registry; defaults to `ASSET_PICKER_KINDS`
 * @returns {GalleryAsset[]}
 */
export function filterPickerAssets(
  assets: GalleryAsset[],
  kinds: AssetPickerKind[] = ASSET_PICKER_KINDS,
): GalleryAsset[] {
  return assets.filter((asset,) => kinds.some((k,) => k.matches(asset,)));
}

type MessageActionsCtx = ChatState & MessageActionsState;

export const messageActions: Partial<MessageActionsState> & ThisType<MessageActionsCtx> = {
  _improvingMessageId: null,
  _assetPickerFor: null,
  _assetPickerAssets: [],
  _assetPickerLoading: false,

  /**
   * Improve a user-authored message in place: run the shared prompt-improve
   * service over its content, persist via PATCH, splice the result back into
   * the thread — no list reload, so position in the thread is preserved.
   * @param messageId - Target message id
   */
  async improveMessage(messageId: string,) {
    const msg = this.messages.find((m,) => m.id === messageId);
    if (!msg || msg.role !== "user" || msg.content.length === 0) { return; }
    if (this._improvingMessageId === messageId) { return; }
    this._improvingMessageId = messageId;
    try {
      const res = await apiFetch(
        "/api/v1/generation/prompt",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({
            mode: "improve",
            level: this.isGroupChat ? "style-group" : "style-chat",
            text: msg.content,
            chatId: this.activeChat,
          },),
        } as Parameters<typeof apiFetch>[1],
      );
      if (!res.ok) {
        this.$dispatch?.("show-toast", { type: "error", message: t("toasts.messageImproveFailed",), },);
        return;
      }
      const data = await res.json();
      const improved = data?.data?.content;
      if (typeof improved !== "string" || improved.length === 0) {
        this.$dispatch?.("show-toast", { type: "error", message: t("toasts.messageImproveFailed",), },);
        return;
      }
      const patch = await apiFetch(
        `/api/v1/messages/${messageId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ content: improved, },),
        } as Parameters<typeof apiFetch>[1],
      );
      if (!patch.ok) {
        this.$dispatch?.("show-toast", { type: "error", message: t("toasts.messageImproveFailed",), },);
        return;
      }
      // In-place splice: the same message object is mutated, so Alpine's
      // keyed list keeps DOM/scroll position untouched.
      msg.content = improved;
      msg.edited_at = new Date().toISOString();
      this.$dispatch?.("show-toast", { type: "success", message: t("toasts.messageImproved",), },);
    } catch (err) {
      log.error("message improve failed", undefined, { messageId, error: String(err,), },);
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.messageImproveFailed",), },);
    } finally {
      this._improvingMessageId = null;
    }
  },

  /**
   * Open the attach picker for one message and load the chat gallery,
   * filtered through the registered kind registry.
   * @param messageId - Message the picker will attach to
   */
  async openAssetPicker(messageId: string,) {
    if (!this.activeChat) { return; }
    this._assetPickerFor = messageId;
    this._assetPickerAssets = [];
    this._assetPickerLoading = true;
    try {
      const res = await apiFetch(
        `/api/v1/assets?entity_type=chat&entity_id=${this.activeChat}&pageSize=200`,
      );
      if (!res.ok) { throw new Error(`gallery fetch ${String(res.status,)}`,); }
      const data = await res.json();
      const rows: GalleryAsset[] = Array.isArray(data?.data,) ? data.data : [];
      this._assetPickerAssets = filterPickerAssets(rows,);
    } catch (err) {
      log.error("asset picker load failed", undefined, { messageId, error: String(err,), },);
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.assetPickerLoadFailed",), },);
      this.closeAssetPicker();
    } finally {
      this._assetPickerLoading = false;
    }
  },

  /** Close the attach picker and drop its loaded rows. */
  closeAssetPicker() {
    this._assetPickerFor = null;
    this._assetPickerAssets = [];
    this._assetPickerLoading = false;
  },

  /**
   * Attach a gallery asset to an already-sent message, then refetch that
   * single message so its enriched attachment row (url/type/dimensions)
   * renders without a thread reload.
   * @param messageId - Message to attach to
   * @param assetId - Owned gallery asset id
   */
  async attachAssetToMessage(messageId: string, assetId: string,) {
    try {
      const res = await apiFetch(
        `/api/v1/messages/${messageId}/attachments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ assetId, },),
        } as Parameters<typeof apiFetch>[1],
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: undefined, }));
        this.$dispatch?.("show-toast", {
          type: "error",
          message: err?.message ?? t("toasts.assetAttachFailed",),
        },);
        return;
      }
      const refreshed = await apiFetch(`/api/v1/messages/${messageId}`,);
      if (refreshed.ok) {
        const body = await refreshed.json();
        const target = this.messages.find((m,) => m.id === messageId);
        if (target && Array.isArray(body?.attachments,)) {
          target.attachments = body.attachments as Message["attachments"];
        }
      }
      this.closeAssetPicker();
      this.$dispatch?.("show-toast", { type: "success", message: t("toasts.assetAttached",), },);
    } catch (err) {
      log.error("message attach failed", undefined, { messageId, assetId, error: String(err,), },);
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.assetAttachFailed",), },);
    }
  },
};
