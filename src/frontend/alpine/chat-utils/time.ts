// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ChatState, } from "../types";

export type ChatUtilsTime = Partial<ChatState> & ThisType<ChatState>;

export const chatUtilsTime: ChatUtilsTime = {
  formatTime(iso: string,) {
    if (!iso) { return ""; }
    const d = new Date(iso,);
    if (Number.isNaN(d.getTime(),)) { return ""; }
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", },);
  },

  formatTimeShort(iso: string,) {
    if (!iso) { return ""; }
    const d = new Date(iso,);
    if (Number.isNaN(d.getTime(),)) { return ""; }
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", },);
  },
};
