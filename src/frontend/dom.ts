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

/**
 * Query a single element by CSS selector, typed.
 * @param selector
 * @param root
 */

/**
 * @param selector
 * @param root
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

/**
 * @param e
 */
export function eventTarget<T extends HTMLElement,>(e: Event,): T | null {
  return e.target as T | null;
}

/**
 * Typed `currentTarget` — extracts the element the listener is bound to.
 * @param e
 */

/**
 * @param e
 */
export function eventCurrentTarget<T extends HTMLElement,>(e: Event,): T | null {
  return e.currentTarget as T | null;
}
