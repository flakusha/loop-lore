// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { storageSet, } from "../../storage";
import { setLocalInferenceOptIn, } from "../local-inference";
import type { SettingsState, } from "./types";

/**
 * @returns {Partial<SettingsState> & ThisType<SettingsState>}
 */
export function chat(): Partial<SettingsState> & ThisType<SettingsState> {
  return {
    /**
     * @returns {Promise<void>}
     */
    async saveChat() {
      storageSet("local", "chat-enter-to-send", this.enterToSend ? "1" : "0",);
      storageSet("local", "chat-auto-scroll", this.autoScroll ? "1" : "0",);
      storageSet("local", "chat-inline-preview", this.inlinePreview ? "1" : "0",);
      storageSet("local", "chat-detail-level", this.detailLevel,);
      setLocalInferenceOptIn(this.localInferenceOptIn,);
      // Persist the chat flags server-side too — the local copies only
      // reflect this browser; users.settings is the cross-device source of
      // truth (BUG-bug-chat-settings-toggles-not-persisted).
      await this.persistSettings({
        enterToSend: this.enterToSend,
        autoScroll: this.autoScroll,
        inlinePreview: this.inlinePreview,
        detailLevel: this.detailLevel,
      },);
    },
  };
}
