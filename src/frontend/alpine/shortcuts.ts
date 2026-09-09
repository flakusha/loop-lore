// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Keyboard Shortcuts
 *
 * Ctrl+B   — toggle sidebar
 * Ctrl+N   — new chat
 * Ctrl+L   — focus message input
 * Ctrl+K   — focus search (gallery/characters/worlds)
 * Escape   — close sidebar / close modals
 *
 * Opt-in key navigation (single-key and g-prefixed sequences, "?" help)
 * dispatches `keynav:action` / `keynav:toggle-help` CustomEvents that
 * Alpine components (e.g. keynavHelp) subscribe to. Enabled only when
 * the `keynav` localStorage flag is set.
 */

/** A single entry of the keyboard navigation keymap. */
export interface ShortcutEntry {
  /** Key combo, e.g. "g g", "?", "j". */
  combo: string;
  /** Action identifier dispatched on `keynav:action`. */
  action: string;
  /** When true, the combo is ignored while typing in inputs. */
  ignoreInInput?: boolean;
}

/** Default single-key / sequence navigation keymap (opt-in). */
export const DEFAULT_KEYMAP: ShortcutEntry[] = [
  { combo: "?", action: "toggle-help", },
  { combo: "g g", action: "goto-chatlist", },
  { combo: "g p", action: "goto-personas", },
  { combo: "g c", action: "goto-characters", },
  { combo: "g s", action: "goto-settings", },
  { combo: "g a", action: "goto-gallery", },
  { combo: "g h", action: "goto-home", },
  { combo: "[", action: "prev-chat", ignoreInInput: true, },
  { combo: "]", action: "next-chat", ignoreInInput: true, },
  { combo: "j", action: "scroll-down", ignoreInInput: true, },
  { combo: "k", action: "scroll-up", ignoreInInput: true, },
];

const KEYNAV_FLAG = "keynav";

/**
 * Read the keymap registry.
 * @returns A fresh copy of {@link DEFAULT_KEYMAP}
 */
export function getKeymap(): ShortcutEntry[] {
  return DEFAULT_KEYMAP.map((entry,) => ({ ...entry, }));
}

/**
 * Whether opt-in keyboard navigation is enabled.
 * Reads the `keynav` localStorage flag; safe when storage is absent.
 * @returns True when key navigation is enabled
 */
export function isKeyboardNavEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEYNAV_FLAG,) === "1";
  } catch {
    return false;
  }
}

/**
 * Dispatch a keynav action on window for Alpine components.
 * @param action - The action identifier from the keymap
 */
export function dispatchKeynavAction(action: string,): void {
  window.dispatchEvent(new CustomEvent("keynav:action", { detail: { action, }, bubbles: true, },),);
}

/** Pending "g"-prefixed sequence awaiting its second key. */
let pendingG = false;

document.addEventListener("keydown", (e: KeyboardEvent,) => {
  const target = e.target as HTMLElement;
  const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

  // Ctrl+B — toggle sidebar (works everywhere)
  if (e.ctrlKey && e.key === "b") {
    e.preventDefault();
    globalThis.toggleSidebar();
    return;
  }

  // Skip remaining shortcuts when typing in an input
  if (isInput) { return; }

  // Ctrl+N — new chat
  if (e.ctrlKey && e.key === "n") {
    e.preventDefault();
    const link = document.querySelector<HTMLAnchorElement>('[href="/views/new-chat"]',);
    if (link) {
      link.click();
    } else {
      location.assign("/views/new-chat",);
    }
    return;
  }

  // Ctrl+L — focus message input
  if (e.ctrlKey && e.key === "l") {
    e.preventDefault();
    const input = document.querySelector<HTMLTextAreaElement>("#message-input, .input-row textarea",);
    input?.focus();
    return;
  }

  // Ctrl+K — focus search
  if (e.ctrlKey && e.key === "k") {
    e.preventDefault();
    const search = document.querySelector<HTMLInputElement>('.list-search, [type="search"]',);
    search?.focus();
    return;
  }

  // Opt-in key navigation below — inert unless the user enabled it.
  if (!isKeyboardNavEnabled() || e.ctrlKey || e.altKey || e.metaKey) { return; }

  // "?" — toggle the keynav help overlay (always allowed once nav is on)
  if (e.key === "?") {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("keynav:toggle-help",),);
    return;
  }

  // "g" starts a two-key sequence; the next key completes it.
  if (pendingG) {
    pendingG = false;
    const sequence = `g ${e.key}`;
    const entry = DEFAULT_KEYMAP.find((k,) => k.combo === sequence);
    if (entry) {
      e.preventDefault();
      dispatchKeynavAction(entry.action,);
    }
    return;
  }

  if (e.key === "g") {
    pendingG = true;
    return;
  }

  const single = DEFAULT_KEYMAP.find((k,) => k.combo === e.key);
  if (single) {
    e.preventDefault();
    dispatchKeynavAction(single.action,);
  }
},);
