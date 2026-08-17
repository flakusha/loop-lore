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
   * Confirm and save the wizard draft. Sends the wizard ID to the backend
   * which persists the entity and returns a create-entity result.
   */
  async confirmWizard(wizardId: string,): Promise<void> {
    const draft = this.wizardDraft;
    if (!draft || draft.wizardId !== wizardId) {
      log.warn("confirmWizard: draft mismatch", { wizardId, },);
      return;
    }
    const chatId = this.activeChat;
    if (!chatId) { return; }

    // Build field overrides from the (possibly edited) draft
    const overrides: string[] = [];
    for (const [key, value,] of Object.entries(draft.fields,)) {
      if (value) { overrides.push(`${key}=${value}`,); }
    }

    try {
      const cmdArgs = ["confirm", wizardId, ...overrides,];
      const res = await apiFetch(`/api/v1/chats/${chatId}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ command: "create", args: cmdArgs, },),
      },);

      if (res.ok) {
        this.wizardPreviewOpen = false;
        this.wizardDraft = null;
        this.$dispatch?.("show-toast", {
          type: "info",
          message: t("toasts.wizardConfirmed",),
        },);
        log.info("wizard confirmed", { wizardId, entityType: draft.entityType, },);
      } else {
        let errorMsg = t("toasts.wizardConfirmFailed",);
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
        message: t("toasts.networkError",),
      },);
    }
  },

  /**
   * Cancel and discard the wizard draft.
   */
  async cancelWizard(wizardId: string,): Promise<void> {
    const chatId = this.activeChat;
    if (chatId) {
      // Fire-and-forget backend cancel (best-effort)
      try {
        await apiFetch(`/api/v1/chats/${chatId}/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ command: "create", args: ["cancel", wizardId,], },),
        },);
      } catch {
        // Best-effort — draft expires in 30 min anyway
      }
    }
    this.wizardPreviewOpen = false;
    this.wizardDraft = null;
    log.info("wizard cancelled", { wizardId, },);
  },
};
