// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Typed DOM query helpers.
 *
 * `querySelector()` returns `Element | null`, forcing `as HTML*Element` casts
 * everywhere. These helpers narrow the return type in one place, eliminating
 * ~80% of frontend type assertions.
 *
 * Usage:
 *   const ta = $<HTMLTextAreaElement>("#my-input");
 *   const form = $<HTMLFormElement>("#my-form", container);
 *   const items = $all<HTMLLIElement>(".list-item");
 */
export function $<T extends HTMLElement,>(
  selector: string,
  root: ParentNode = document,
): T | null {
  return root.querySelector<T>(selector,);
}

/**
 * Query all matching elements by CSS selector, typed (NodeListOf).
 * @param selector
 * @param root
 * @returns {NodeListOf<T>}
 */
export function $all<T extends HTMLElement,>(
  selector: string,
  root: ParentNode = document,
): NodeListOf<T> {
  return root.querySelectorAll<T>(selector,);
}

/**
 * Typed event target — extracts the concrete element from an Event.
 *
 * Usage:
 *   function handleClick(e: Event) {
 *     const input = eventTarget<HTMLInputElement>(e);
 *     console.log(input.value);
 *   }
 * @param e
 */
export function eventTarget<T extends HTMLElement,>(e: Event,): T | null {
  return e.target as T | null;
}

/**
 * Typed `currentTarget` — extracts the element the listener is bound to.
 * @param e
 */
export function eventCurrentTarget<T extends HTMLElement,>(e: Event,): T | null {
  return e.currentTarget as T | null;
}

/**
 * Re-issue an htmx `hx-get` element's request so its content reflects a
 * mutation that happened outside htmx.
 *
 * `htmx.trigger(el, "load")` does NOT re-run an `hx-trigger="load"` handler in
 * htmx 2 — that trigger is one-shot, so the swap silently never happens and the
 * panel keeps rendering pre-mutation data. Re-issuing through `htmx.ajax`
 * against the element's own `hx-get` keeps the URL in exactly one place.
 * @param selector - selector for the element carrying `hx-get`, already in the DOM
 * @returns whether a request was issued
 */
export function refreshHtmx(selector: string | null | undefined,): boolean {
  if (!selector) { return false; }
  const el = document.querySelector(selector,);
  if (!el) { return false; }
  const url = el.getAttribute("hx-get",);
  if (!url) { return false; }
  htmx.ajax("GET", url, {
    target: selector,
    swap: el.getAttribute("hx-swap",) ?? "innerHTML",
  },);

  return true;
}
