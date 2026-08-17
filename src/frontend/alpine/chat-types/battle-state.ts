// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { BattleView, } from "../../battle/panel";

// ── Battle Panel ──────────────────────────────────────────
/** State + methods for the VN-style battle interaction panel. */
export interface ChatBattleState {
  /** Whether the battle panel is mounted and visible. */
  _battleVisible: boolean;
  /** The mounted panel DOM element (from `$refs.battlePanel`). */
  _battleRef: HTMLDivElement | null;
  /** The last rendered battle view (for poll/SSR re-render). */
  _battle: BattleView | null;
  mountBattlePanel(): void;
  destroyBattlePanel(): void;
  /** Render or clear the panel from a `battle-*` command action payload. */
  renderBattlePanel(view: BattleView | null,): void;
  /** Re-render from the cached battle view after a related change. */
  refreshBattlePanel(): void;
}
