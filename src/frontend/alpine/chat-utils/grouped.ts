// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { toDate, } from "../../../utils/date";
import type { ChatState, GroupedMessage, } from "../types";

export const chatUtilsGroupedData: Partial<ChatState> & ThisType<ChatState> = {
  _groupedCache: null as GroupedMessage[] | null,
  _groupedKey: "",
};

/**
 * @param {ChatState} state
 * @returns {GroupedMessage[]}
 */
export function computeGroupedMessages(state: ChatState,): GroupedMessage[] {
  const msgs = state.messages;
  if (!msgs || msgs.length === 0) { return []; }
  // Status changes (optimistic send -> queued) keep the same id and length but
  // change what templates render; include it so the cache cannot serve a stale row.
  const key = `${msgs.length}:${msgs.map((m,) => `${m.id}:${m.status ?? ""}`).join("|",)}`;
  if (state._groupedKey === key && state._groupedCache) { return state._groupedCache; }
  const groups: GroupedMessage[] = [];
  for (let i = 0; i < msgs.length; i++) {
    const msg = { ...msgs[i], } as GroupedMessage;
    if (i > 0) {
      const prev = msgs[i - 1];
      if (!prev) { continue; }
      const sameRole = msg.role === prev.role;
      // Section change always starts a new group so section dividers
      // align with the message stream.
      const sameSection = msg.section_id === prev.section_id;
      const timeDiff = toDate(msg.created_at,).getTime() - toDate(prev.created_at,).getTime();
      if (sameRole && sameSection && timeDiff < 300_000) {
        msg.group = true;
        const last = groups[groups.length - 1];
        if (last) { last.groupCount = ((last.groupCount as number) ?? 1) + 1; }
      }
    }

    groups.push(msg,);
  }

  state._groupedKey = key;
  state._groupedCache = groups;
  return groups;
}
