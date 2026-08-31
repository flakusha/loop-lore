// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { SettingsState, } from "./types";

/** */
export function chat(): Partial<SettingsState> & ThisType<SettingsState> {
  return {
    async saveChat() {
      localStorage.setItem("chat-enter-to-send", this.enterToSend ? "1" : "0",);
      localStorage.setItem("chat-auto-scroll", this.autoScroll ? "1" : "0",);
      localStorage.setItem("chat-inline-preview", this.inlinePreview ? "1" : "0",);
      localStorage.setItem("chat-detail-level", this.detailLevel,);
      await this.persistSettings({ detailLevel: this.detailLevel, },);
    },
  };
}
