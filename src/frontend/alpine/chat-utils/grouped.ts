import type { ChatState, GroupedMessage, } from "../types";

export const chatUtilsGroupedData: Partial<ChatState> & ThisType<ChatState> = {
  _groupedCache: null as GroupedMessage[] | null,
  _groupedKey: "",
};

export function computeGroupedMessages(this: ChatState,): GroupedMessage[] {
  const msgs = this.messages;
  if (!msgs || msgs.length === 0) { return []; }
  const key = `${msgs.length}:${msgs[msgs.length - 1]?.id ?? ""}:${msgs[0]?.id ?? ""}`;
  if (this._groupedKey === key && this._groupedCache) { return this._groupedCache; }
  const groups: GroupedMessage[] = [];
  for (let i = 0; i < msgs.length; i++) {
    const msg = { ...msgs[i], } as GroupedMessage;
    if (i > 0) {
      const prev = msgs[i - 1];
      if (!prev) { continue; }
      const sameRole = msg.role === prev.role;
      const timeDiff = new Date(msg.created_at,).getTime() - new Date(prev.created_at,).getTime();
      if (sameRole && timeDiff < 300_000) {
        msg.group = true;
        const last = groups[groups.length - 1];
        if (last) { last.groupCount = ((last.groupCount as number) ?? 1) + 1; }
      }
    }
    groups.push(msg,);
  }
  this._groupedKey = key;
  this._groupedCache = groups;
  return groups;
}
