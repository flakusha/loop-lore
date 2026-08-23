// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Creation wizard Alpine.js state slice.
 *
 * Multi-step entity creation flow:
 *   1. Wizard starts with a preview of LLM-generated entity data
 *   2. User can edit fields inline (step 1)
 *   3. User can set additional options (step 2 — world, visibility)
 *   4. Final review and confirm (step 3)
 *
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
  wizardStep: 1,
  wizardTotalSteps: 3,

  /**
   * Advance to the next wizard step.
   */
  wizardNextStep(): void {
    if (this.wizardStep < this.wizardTotalSteps) {
      this.wizardStep++;
    }
  },

  /**
   * Go back to the previous wizard step.
   */
  wizardPrevStep(): void {
    if (this.wizardStep > 1) {
      this.wizardStep--;
    }
  },

  /**
   * Reset wizard to step 1 (called on cancel or confirm).
   */
  wizardResetSteps(): void {
    this.wizardStep = 1;
  },

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
   *
   * State shape note: `wizardDraft` is a single slot, not a keyed map. The
   * `wizardId` parameter is validated against the active draft's wizardId —
   * if they differ, the call is a no-op (logged at warn). This guards against
   * cross-talk when a stale wizard's confirm fires after a newer wizard
   * replaced the draft (the second wizard wins, the first is silently dropped
   * by the guard rather than committing the wrong entity). Switching to a
   * keyed map would be required to support concurrent live drafts.
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
        this.wizardResetSteps();
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
   * Cancel and discard the wizard draft. Resets step counter.
   */
  async cancelWizard(_wizardId: string,): Promise<void> {
    this.wizardPreviewOpen = false;
    this.wizardDraft = null;
    this.wizardResetSteps();
    log.info("wizard cancelled", { wizardId: _wizardId, },);
  },
};
