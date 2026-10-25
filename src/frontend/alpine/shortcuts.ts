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
import { jsonParseOr, safeJsonStringify, } from "../../utils";
import { log as rootLog, } from "./logger";

export const log = rootLog.child({ module: "shortcuts", },);
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
/** localStorage key holding `{ [action]: combo }` rebinding overrides. */
export const KEYMAP_STORAGE_KEY = "keynav.keymap";
/** Combos the editor may never rebind: help toggle, overlay dismiss, sequence prefix. */
export const RESERVED_COMBOS: readonly string[] = ["?", "Escape", "g",];
const BARE_MODIFIERS: readonly string[] = ["Shift", "Control", "Alt", "Meta",];

/**
 * Read stored keymap overrides from localStorage.
 * Malformed JSON or entries with a non-string combo fall back to no overrides.
 * @returns An action → combo override map (possibly empty)
 */
function loadKeymapOverrides(): Record<string, string> {
  try {
    const raw = globalThis.localStorage?.getItem(KEYMAP_STORAGE_KEY,);
    if (!raw) { return {}; }
    const parsed = jsonParseOr<Record<string, unknown>>(raw, {},);
    if (typeof parsed !== "object" || parsed === null) { return {}; }
    const overrides: Record<string, string> = {};
    for (const [action, combo,] of Object.entries(parsed,)) {
      if (typeof combo === "string" && combo.length > 0) {
        overrides[action] = combo;
      }
    }

    return overrides;
  } catch {
    return {};
  }
}

/**
 * Result of validating a candidate keymap combo.
 * - `ok: true` — the combo may be stored for the action
 * - `ok: false` — `reason` is an i18n key suffix under `frontend.keynav.editor.`
 */
export type KeymapValidation = { ok: true } | { ok: false; reason: string };

/**
 * Validate a candidate combo for an action against the current keymap.
 * Rules: single key or `g <key>` sequence, no bare modifiers, reserved
 * combos (`?`, `Escape`, `g`) stay fixed, no duplicates.
 * @param combo - Candidate combo string
 * @param action - The action being rebound
 * @param entries - Current full keymap (merged), including the action itself
 * @returns Discriminated validation result
 */
export function validateKeymapCombo(
  combo: string,
  action: string,
  entries: ShortcutEntry[],
): KeymapValidation {
  const trimmed = combo.trim();
  if (trimmed.length === 0 || trimmed.length > 3) {
    return { ok: false, reason: "invalid", };
  }

  const parts = trimmed.split(" ",);
  const keys = parts.filter((p,) => p.length > 0);
  if (parts.length > 2 || keys.some((k,) => BARE_MODIFIERS.includes(k,))) {
    return { ok: false, reason: "invalid", };
  }

  // Length guards make the indexed reads total; `!` asserts it.
  if (keys.length === 1 && RESERVED_COMBOS.includes(keys[0]!,)) {
    return { ok: false, reason: "reserved", };
  }

  // Inside a sequence only the second key is checked: the `g` prefix is the
  // reserved sequence starter, and "g g" is a legitimate (default) binding.
  if (keys.length === 2 && RESERVED_COMBOS.slice(0, 2,).includes(keys[1]!,)) {
    return { ok: false, reason: "reserved", };
  }

  if (entries.some((e,) => e.action !== action && e.combo === trimmed)) {
    return { ok: false, reason: "duplicate", };
  }

  return { ok: true, };
}

/**
 * Persist an override (removed again when it equals the default combo).
 * Storage failures degrade to a logged warning; the session keeps defaults.
 * @param action - Action to rebind
 * @param combo - New combo (validated by the caller)
 * @returns {void}
 */
export function setKeymapOverride(action: string, combo: string,): void {
  try {
    const stored = loadKeymapOverrides();
    const def = DEFAULT_KEYMAP.find((e,) => e.action === action);
    if (def && def.combo === combo) {
      delete stored[action];
    } else {
      stored[action] = combo;
    }

    const encoded = safeJsonStringify(stored,);
    if (encoded.ok) {
      globalThis.localStorage?.setItem(KEYMAP_STORAGE_KEY, encoded.value,);
    }
  } catch (error) {
    log.warn("keymap override persist failed", { err: (error as Error).message, },);
  }

  mergedCache = null;
}

/** Remove all stored rebinding overrides and restore DEFAULT_KEYMAP. */
export function resetKeymapOverrides(): void {
  try {
    globalThis.localStorage?.removeItem(KEYMAP_STORAGE_KEY,);
  } catch (error) {
    log.warn("keymap override reset failed", { err: (error as Error).message, },);
  }

  mergedCache = null;
}

/** Cached merged keymap; invalidated by override writes. */
let mergedCache: ShortcutEntry[] | null = null;

/**
 * The keymap with stored overrides merged over DEFAULT_KEYMAP (cached).
 * @returns The effective keymap entries
 */
function effectiveKeymap(): ShortcutEntry[] {
  if (!mergedCache) {
    const overrides = loadKeymapOverrides();
    mergedCache = DEFAULT_KEYMAP.map(
      (entry,) => ({ ...entry, combo: overrides[entry.action] ?? entry.combo, }),
    );
  }

  return mergedCache;
}

/**
 * Read the keymap registry (defaults merged with stored overrides).
 * @returns A fresh copy of the effective keymap
 */
export function getKeymap(): ShortcutEntry[] {
  return effectiveKeymap().map((entry,) => ({ ...entry, }));
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
 * @returns {void}
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
 * @returns {() => void}
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
    // Only remove the map entry if it is still the set we registered into;
    // a stale unsubscribe from a previous registration must not delete the
    // live handler set registered afterwards.
    if (set && set.size === 0 && keynavHandlers.get(action,) === set) {
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
 * @returns {void}
 */
export function dispatchKeynavActionToHandlers(action: string,): void {
  const set = keynavHandlers.get(action,);
  if (!set) { return; }
  for (const handler of set) {
    try {
      handler();
    } catch (err) {
      log.error(
        `[keynav] handler for "${action}" threw`,
        err instanceof Error ? err : new Error(String(err,),),
      );
    }
  }
}

/**
 * Test-only: clear all registered handlers. Not exported in the public API.
 * @returns {void}
 */
export function __resetKeynavHandlersForTests(): void {
  keynavHandlers.clear();
}

/** Pending "g"-prefixed sequence awaiting its second key. */
let pendingG = false;

if (typeof document.addEventListener === "function") {
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
      const entry = effectiveKeymap().find((k,) => k.combo === sequence);
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

    const single = effectiveKeymap().find((k,) => k.combo === e.key);
    if (single) {
      e.preventDefault();
      dispatchKeynavActionToHandlers(single.action,);
      dispatchKeynavAction(single.action,);
    }
  },);
}
