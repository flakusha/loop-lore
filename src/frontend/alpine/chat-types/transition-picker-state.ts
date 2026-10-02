// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Picker modes for a location transition (location-transition ticket AC1). */
export type TransitionMode = "in-place" | "new-chat" | "isolate";

/**
 * Header transition-mode picker slice (merge into the chatState methods on
 * registration). Display state lives on `$store.ui` — the chat header is
 * outside the chatState x-data scope; these methods run on the chatState
 * instance so they can reach `activeChat` / `loadLocations`.
 */
export interface TransitionPickerState {
  /** Open/close the header dropdown; loads world locations on open. */
  toggleTransitionPicker(): Promise<void>;
  /** Run one picker mode against the chosen destination location. */
  runLocationTransition(mode: TransitionMode,): Promise<void>;
}
