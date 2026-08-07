import type { ChatState, } from "../types";
import { _anonymousModeEnabled, } from "./anonymous";

export type ChatUtilsInteraction = Partial<ChatState> & ThisType<ChatState>;

export const chatUtilsInteraction: ChatUtilsInteraction = {
  openContextMenu(event: MouseEvent, msgId: string,) {
    event.preventDefault();
    event.stopPropagation();
    this._contextMenu = {
      visible: true,
      messageId: msgId,
      x: Math.min(event.clientX, window.innerWidth - 200,),
      y: Math.min(event.clientY, window.innerHeight - 300,),
    };
  },

  closeContextMenu() {
    this._contextMenu = { visible: false, messageId: null, x: 0, y: 0, };
  },

  showReactionPicker(msgId: string, event: Event,) {
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    this._reactionPicker = {
      visible: true,
      messageId: msgId,
      x: Math.min(rect.left, window.innerWidth - 240,),
      y: Math.max(rect.top - 44, 8,),
    };
  },

  closeReactionPicker() {
    this._reactionPicker.visible = false;
  },

  displayName(msg: { role: string; actor_name?: string; actor_id?: string },): string {
    if (msg.role === "user") { return "You"; }
    if (msg.role === "system") { return "System"; }
    if (msg.role === "narration") { return "Narrator"; }

    // In anonymous mode, non-user messages show as "Anonymous"
    if (_anonymousModeEnabled && msg.role !== "user") {
      return "Anonymous";
    }

    return msg.actor_name || "Assistant";
  },
};
