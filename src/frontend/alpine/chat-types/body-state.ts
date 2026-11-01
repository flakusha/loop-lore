// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { BodyStateView, } from "../../nsfw/body-state";

/** */
export interface ChatBodyStateState {
  /** Mapped body-state view for the chat character; null when nothing is renderable. */
  _bodyStateView: BodyStateView | null;
  /** Mount (or clear) the widget in the `$refs.bodyStatePanel` slot. */
  mountBodyState(): void;
  /** Load health, conditions and arousal for the active chat's character. */
  loadBodyState(): Promise<void>;
}
