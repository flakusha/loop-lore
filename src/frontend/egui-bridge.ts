// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * htmx ↔ egui transfer bridge (browser side).
 *
 * The htmx frontend and the experimental egui WASM frontend are separate
 * documents with no shared runtime, so a handoff persists a small context
 * blob in localStorage (`EGUI_CONTEXT_KEY`) and navigates: htmx → egui
 * stores the active chat id plus the URL to return to, egui → htmx reads
 * it back. Both sides rewrite the same shape on every transfer.
 *
 * Malformed JSON, a wrong version, non-string fields, or a `returnTo` that
 * could redirect off-origin all degrade to `DEFAULT_EGUI_CONTEXT` so a
 * corrupt entry can never strand the user. See .tmp/egui-contract.md.
 */

import { jsonParseOr, jsonStringifyOr, } from "../utils";
// The SSE stream surface is part of the same bridge bundle: one script on the
// /egui host page, one place the wasm app reaches the browser through.
import { initEguiStream, } from "./egui-stream";

/** localStorage key carrying the transfer context (contract v1). */
export const EGUI_CONTEXT_KEY = "loop-lore.egui-context.v1";

/** Transfer context written by both sides on every htmx ↔ egui handoff. */
export interface EguiContext {
  version: 1;
  activeChatId: string | null;
  returnTo: string;
}

/** Context used when storage is empty, unreadable, or fails validation. */
export const DEFAULT_EGUI_CONTEXT: EguiContext = {
  version: 1,
  activeChatId: null,
  returnTo: "/views/chat",
};

export interface EguiBridgeOptions {
  storage?: Storage | null;
}

/** Selector of the chat header's egui entry button (also the e2e hook). */
const OPEN_IN_EGUI_SELECTOR = '[data-testid="open-in-egui"]';

/**
 * Read the stored transfer context. A missing, unreadable, or invalid blob
 * yields `DEFAULT_EGUI_CONTEXT`.
 * @param root0
 * @returns the stored context, or the defaults when absent/invalid.
 */
export function readEguiContext({ storage, }: EguiBridgeOptions = {},): EguiContext {
  const store = resolveStorage(storage,);
  let raw: string | null = null;
  try {
    raw = store?.getItem(EGUI_CONTEXT_KEY,) ?? null;
  } catch {
    raw = null;
  }

  return raw === null ? { ...DEFAULT_EGUI_CONTEXT, } : validateContext(jsonParseOr<unknown>(raw, null,),);
}

/**
 * Persist the transfer context (normalized first). Storage failures are
 * swallowed — a handoff must navigate even when storage refuses to write.
 * @param context
 * @param root0
 */
export function writeEguiContext(context: EguiContext, { storage, }: EguiBridgeOptions = {},): void {
  const store = resolveStorage(storage,);
  if (!store) { return; }
  try {
    store.setItem(EGUI_CONTEXT_KEY, jsonStringifyOr(validateContext(context,),),);
  } catch {
    // Quota / privacy-mode failures must never break a handoff.
  }
}

/** htmx → egui: store the current chat id and return URL, then open egui. */
export function handoffToEgui(): void {
  const chatId = new URLSearchParams(location.search,).get("chatid",);
  writeEguiContext({
    version: 1,
    activeChatId: chatId ? chatId.trim().toLowerCase() : null,
    returnTo: `${location.pathname}${location.search}`,
  },);

  location.assign("/egui",);
}

/** egui → htmx: keep the stored chat id, restore `returnTo`, navigate back. */
export function returnToHtmx(): void {
  const { activeChatId, returnTo, } = readEguiContext();
  writeEguiContext({ version: 1, activeChatId, returnTo, },);
  location.assign(returnTo,);
}

/**
 * Injected storage wins; otherwise the ambient `localStorage` (may be absent).
 * @param injected
 */
function resolveStorage(injected?: Storage | null,): Storage | null {
  if (injected !== undefined) { return injected; }
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Narrow an unknown parsed blob to `EguiContext`, else the defaults.
 * @param value
 */
function validateContext(value: unknown,): EguiContext {
  if (value === null || typeof value !== "object" || Array.isArray(value,)) { return { ...DEFAULT_EGUI_CONTEXT, }; }
  const { version, activeChatId, returnTo, } = value as Record<string, unknown>;
  if (version !== 1) { return { ...DEFAULT_EGUI_CONTEXT, }; }
  // Origin-absolute paths only: a leading `//` would redirect off-origin.
  if (typeof returnTo !== "string" || !returnTo.startsWith("/",) || returnTo.startsWith("//",)) {
    return { ...DEFAULT_EGUI_CONTEXT, };
  }

  if (activeChatId !== null && typeof activeChatId !== "string") { return { ...DEFAULT_EGUI_CONTEXT, }; }
  return { version: 1, activeChatId, returnTo, };
}

const bridge = { handoffToEgui, returnToHtmx, readEguiContext, writeEguiContext, } as const;

export type EguiBridge = typeof bridge;

declare global {
  interface Window {
    loopLoreEgui: EguiBridge;
  }
}

/**
 * Expose the bridge on `window` and wire the chat header's entry button.
 * The click handler is delegated on `document` (not an inline `onclick`):
 * `script-src` has no `'unsafe-inline'`
 * (BUG-csp-unsafe-inline-defeats-per-request-nonce) and the chat view is an
 * htmx fragment, so the button can be swapped into the DOM at any time.
 */
export function initEguiBridge(): void {
  if (typeof document === "undefined" || typeof window === "undefined") { return; }
  window.loopLoreEgui = bridge;
  initEguiStream();
  document.addEventListener("click", (event: Event,) => {
    const target = event.target as { closest?: (selector: string,) => unknown } | null;
    if (typeof target?.closest === "function" && target.closest(OPEN_IN_EGUI_SELECTOR,)) { handoffToEgui(); }
  },);
}

initEguiBridge();
