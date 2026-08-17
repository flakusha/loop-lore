// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Creation wizard Alpine.js state slice.
 *
 * Provides confirm/cancel/edit methods for the wizard preview panel.
 * The actual preview rendering lives in the chat view HTML template.
 */
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import type { ChatState, } from "./types";

const log = rootLog.child({ module: "creation-wizard", },);

export const creationWizard: Partial<ChatState> & ThisType<ChatState> = {
  wizardDraft: null,
  wizardPreviewOpen: false,

  /**
   * Update a single field in the wizard draft (called from inline edit inputs).
   */
  updateWizardField(field: string, value: string,): void {
    if (!this.wizardDraft) { return; }
    this.wizardDraft.fields[field] = value;
  },

  /**
   * Confirm and save the wizard draft. Sends the edited entity data to the
   * create-entity-confirm endpoint which persists the entity.
   */
  async confirmWizard(wizardId: string,): Promise<void> {
    if (this.wizardDraft?.wizardId !== wizardId) {
      log.warn("confirmWizard: draft mismatch", { wizardId, },);
      return;
    }
    const draft = this.wizardDraft;
    const chatId = this.activeChat;
    if (!chatId) { return; }

    try {
      const res = await apiFetch(`/api/chats/${chatId}/create-entity`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          kind: draft.entityType,
          data: draft.fields,
          description: draft.description ?? "",
          worldId: draft.worldId ?? null,
          userId: draft.userId ?? null,
        },),
      },);

      if (res.ok) {
        this.wizardPreviewOpen = false;
        this.wizardDraft = null;
        this.$dispatch?.("show-toast", {
          type: "success",
          message: t("toasts.entityCreated", { name: draft.fields.name ?? "Entity", },),
        },);
        await this.loadMessages();
        log.info("wizard confirmed", { wizardId, entityType: draft.entityType, },);
      } else {
        let errorMsg = t("toasts.failedCreateEntity",);
        try {
          const err = await res.json();
          if (err.error) { errorMsg = err.error; }
        } catch {
          // Use default error message
        }
        this.$dispatch?.("show-toast", {
          type: "error",
          message: errorMsg,
        },);
      }
    } catch {
      this.$dispatch?.("show-toast", {
        type: "error",
        message: t("toasts.networkErrorCreatingEntity",),
      },);
    }
  },

  /**
   * Cancel and discard the wizard draft. No backend call needed — the draft
   * lives only in Alpine state (the quality gate version doesn't use an
   * in-memory wizard store).
   */
  cancelWizard(_wizardId: string,): void {
    this.wizardPreviewOpen = false;
    this.wizardDraft = null;
    log.info("wizard cancelled", { wizardId: _wizardId, },);
  },
};
