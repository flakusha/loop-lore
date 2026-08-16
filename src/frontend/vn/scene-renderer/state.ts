// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { LoadingIndicator, } from "../image-preloader";
import type { VnSettings, } from "../settings";
import type { VnScene, } from "./types";

/**
 * Shared mutable module state for the VN scene renderer.
 *
 * Concurrent calls re-initialize the renderer the same way a single module
 * invocation did before the split, so a shared singleton preserves behavior.
 */
export const state: {
  scenes: VnScene[];
  currentIndex: number;
  container: HTMLElement | null;
  settings: VnSettings | null;
  currentChatId: string | null;
  loadingIndicator: LoadingIndicator | null;
  locationChangeHandler: ((e: Event,) => void) | null;
} = {
  scenes: [],
  currentIndex: 0,
  container: null,
  settings: null,
  currentChatId: null,
  loadingIndicator: null,
  locationChangeHandler: null,
};
