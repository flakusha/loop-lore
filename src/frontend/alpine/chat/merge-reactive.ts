// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Merge a sub-module's own properties into the state object, preserving
 * accessors (getters/setters) as live properties. A plain object spread
 * (`...source`) EVALUATES getters at spread time and copies a stale snapshot,
 * so computed state like `groupedMessages` never recomputes. Use this for any
 * sub-module that declares `get`/`set` accessors consumed by templates.
 * @param target
 * @param source
 */
export function mergeReactiveSource(target: Record<string, unknown>, source: object,): void {
  for (const name of Object.getOwnPropertyNames(source,)) {
    const desc = Object.getOwnPropertyDescriptor(source, name,);
    if (!desc) { continue; }
    if ("value" in desc) {
      target[name] = desc.value;
    } else {
      Object.defineProperty(target, name, desc,);
    }
  }
}
