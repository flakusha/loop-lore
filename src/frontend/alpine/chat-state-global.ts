// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Bridge from the chat header (which lives OUTSIDE the `chatState` x-data
 * scope) back into the Alpine instance. Every header affordance — side
 * channels, message search, the transition picker — needs the same
 * lookup-then-call dance; this is it, once.
 *
 * `.call(data)` is mandatory: a bare `fn()` would run with an undefined
 * `this` and break any action method that touches reactive state.
 */

/** Locates the live chatState scope. Exported for the query-selector assertion in tests. */
export const CHAT_STATE_SELECTOR = "[x-data='chatState()']";

/** Reads the Alpine `$data` object for the chatState scope, or null when absent. */
export function chatStateData(): Record<string, unknown> | null {
  const el = document.querySelector<HTMLElement>(CHAT_STATE_SELECTOR,);
  if (!el || typeof Alpine === "undefined") { return null; }
  return Alpine.$data(el,) as Record<string, unknown>;
}

/**
 * Call a chatState action by name from outside its x-data scope.
 * @param name - Key on the Alpine `$data` object (the action method).
 * @param args - Arguments forwarded to the action.
 * @returns Whatever the action returns, or undefined when the scope or
 *   action is missing (Alpine not booted yet, method not registered).
 */
export function callChatStateAction<T,>(name: string, ...args: unknown[]): T | undefined {
  const data = chatStateData();
  const fn = data?.[name] as ((...a: unknown[]) => T) | undefined;
  return typeof fn === "function" ? fn.apply(data, args,) : undefined;
}

/**
 * Await a chatState action by name from outside its x-data scope. Same
 * lookup as {@link callChatStateAction}; awaiting lets callers sequence on
 * the action's completion before continuing.
 * @param name - Key on the Alpine `$data` object (the action method).
 * @param args - Arguments forwarded to the action.
 * @returns The action's resolved value, or undefined when unavailable.
 */
export function awaitChatStateAction<T,>(name: string, ...args: unknown[]): Promise<T | undefined> {
  return Promise.resolve(callChatStateAction<T>(name, ...args,),);
}
