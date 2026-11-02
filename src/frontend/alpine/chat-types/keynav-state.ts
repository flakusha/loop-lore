// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Chat-page keyboard-navigation wiring state (epic-accessibility-input Phase 3). */
export interface ChatKeynavState {
  /** Unsubscribe fns for every keynav consumer registered by setupKeynav. */
  _keynavUnsubs: (() => void)[];
  /** Attach the chat-page keynav consumers (j/k scroll, [ / ] chat switching). */
  setupKeynav(): void;
  /** Remove every keynav consumer registered by setupKeynav. */
  teardownKeynav(): void;
}
