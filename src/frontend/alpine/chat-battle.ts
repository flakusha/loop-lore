// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat battle panel — mounts the VN-style battle interaction surface into the
 * message input area and bridges it to the chat's slash-command send path.
 *
 * The panel renders the active chat battle (roster + action bar) and lets the
 * user act on it with mouse or keyboard. Actions (`/attack`, `/heal`,
 * `/battle end`) are dispatched through `executeQuickReply`, so they reuse the
 * existing server-side slash-command path (`dispatchCommand`).
 */
import { type BattleView, destroyBattlePanel, mountBattlePanel, renderBattle, } from "../battle/panel";
import type { ChatState, } from "./types";

export const chatBattle: Partial<ChatState> & ThisType<ChatState> = {
  _battleVisible: false,
  _battleRef: null as HTMLDivElement | null,
  _battle: null as BattleView | null,

  /** Mount the battle panel into the input area on first use. */
  mountBattlePanel() {
    if (this._battleRef) { return; }
    const el = this.$refs?.battlePanel as HTMLDivElement | undefined;
    if (!el) { return; }
    this._battleRef = el;
    mountBattlePanel(el, {
      sendCommand: async (command: string,) => {
        await this.executeQuickReply(command,);
      },
    },);
    this._battleVisible = true;
  },

  /** Detach the battle panel and clear the mount. */
  destroyBattlePanel() {
    if (this._battleRef) {
      destroyBattlePanel();
      this._battleRef = null;
    }
    this._battleVisible = false;
    this._battle = null;
  },

  /**
   * Render (or update) the battle panel from a `battle-*` command action.
   * @param view
   */
  renderBattlePanel(view: BattleView | null,) {
    if (view) {
      this._battle = view;
      this.mountBattlePanel();
      if (this._battleVisible && this._battleRef) {
        renderBattle(view,);
      }
    } else {
      this.destroyBattlePanel();
    }
  },

  /** Query the current chat's active battle for SSR/poll re-render. */
  refreshBattlePanel() {
    if (!this._battleVisible || !this._battle) { return; }
    this.mountBattlePanel();
    renderBattle(this._battle,);
  },
};
