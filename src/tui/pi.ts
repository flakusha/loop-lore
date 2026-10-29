// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * pi-tui facade — the ONLY module allowed to name `@oh-my-pi/pi-tui`.
 *
 * Every import goes through a package SUBPATH (never the root barrel): the
 * barrel re-exports the whole engine including chat chrome and status-line
 * integrations that drag `pi-ai`/`pi-agent-core` into the dependency graph.
 * `import-purity.test.ts` enforces the subpath-only rule by source scan.
 */

export { Input as PiInput, } from "@oh-my-pi/pi-tui/components/input";
export { ScrollView, } from "@oh-my-pi/pi-tui/components/scroll-view";
export {
  KeybindingsManager,
  setKeybindings,
  TUI_KEYBINDINGS,
} from "@oh-my-pi/pi-tui/keybindings";
export {
  extractPrintableText,
  matchesKey,
  parseKey,
} from "@oh-my-pi/pi-tui/keys";
export { ProcessTerminal, } from "@oh-my-pi/pi-tui/terminal";
export {
  type Component,
  type Focusable,
  type OverlayHandle,
  TUI,
} from "@oh-my-pi/pi-tui/tui";
export {
  padding,
  truncateToWidth,
  visibleWidth,
} from "@oh-my-pi/pi-tui/utils";
