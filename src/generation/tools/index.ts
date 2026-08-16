// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Builtin assistant tool definitions (core origin).
 *
 * These tools are model-visible and executed with per-request context by
 * `executeToolCalls` at generation time. Includes the memory-write tool and
 * the Item 8 / C3 creation wizards (character/world/location/item).
 */

export { characterCreationTool, CREATE_CHARACTER, } from "./create-character";
export { CREATE_ITEM, itemCreationTool, } from "./create-item";
export { CREATE_LOCATION, locationCreationTool, } from "./create-location";
export { CREATE_WORLD, worldCreationTool, } from "./create-world";
export { MEMORY_NOTE_MAX_CHARS, WRITE_MEMORY_NOTE, writeMemoryNoteTool, } from "./write-memory-note";
