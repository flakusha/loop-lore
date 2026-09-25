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

/** Registered direct handlers for keynav actions (per-page Alpine init). */
const keynavHandlers = new Map<string, Set<() => void>>();

/**
 * Register a handler that fires when a keynav action is dispatched. Multiple
 * handlers per action are allowed; each is invoked in registration order.
 * Returns an unsubscribe function.
 * @param action - The action identifier from the keymap (e.g. "goto-chatlist")
 * @param handler - Side-effect to run when the action fires
 */
export function registerKeynavHandler(action: string, handler: () => void,): () => void {
  let set = keynavHandlers.get(action,);
  if (!set) {
    set = new Set();
    keynavHandlers.set(action, set,);
  }
  set.add(handler,);
  return () => {
    set?.delete(handler,);
    if (set && set.size === 0) {
      keynavHandlers.delete(action,);
    }
  };
}

/**
 * Run all registered handlers for an action (in registration order). Does
 * NOT dispatch the CustomEvent — call {@link dispatchKeynavAction} separately
 * if you need Alpine listeners to fire too.
 *
 * Handler exceptions are caught and logged so a single bad handler does not
 * prevent subsequent handlers in the chain from running. Re-entrant calls
 * (a handler that registers or unregisters during dispatch) are safe: Set
 * iteration reflects mid-iteration mutations, so newly-added handlers for
 * the same action will be called in this dispatch.
 * @param action - The action identifier from the keymap
 */
export function dispatchKeynavActionToHandlers(action: string,): void {
  const set = keynavHandlers.get(action,);
  if (!set) { return; }
  for (const handler of set) {
    try {
      handler();
    } catch (err) {
      // ponytail: console.error until the project's logger is wired into
      // shortcuts.ts (no logger import here to keep this module leaf-level).
      console.error(`[keynav] handler for "${action}" threw:`, err,);
    }
  }
}

/**
 * Test-only: clear all registered handlers. Not exported in the public API.
 */
export function __resetKeynavHandlersForTests(): void {
  keynavHandlers.clear();
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
      dispatchKeynavActionToHandlers(entry.action,);
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
    dispatchKeynavActionToHandlers(single.action,);
    dispatchKeynavAction(single.action,);
  }
},);
