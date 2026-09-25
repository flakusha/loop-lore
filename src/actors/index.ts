// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor child-resource services barrel.
 *
 * Typed CRUD for the four actor child tables, each actor-scoped with an
 * ownership guard (`requireActorOwnership`):
 *
 * - `actor-memories.ts` → `actor_memories`
 * - `actor-notes.ts`    → `actor_notes`
 * - `actor-lore.ts`     → `actor_lore_entries`
 * - `actor-items.ts`    → `actor_items`
 */
export { requireActorOwnership, } from "./access";
export * from "./actor-items";
export * from "./actor-lore";
export * from "./actor-memories";
export * from "./actor-notes";
export * from "./types";
