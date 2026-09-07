// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin EventBus placeholder (FEAT-048).
 *
 * No-op integration: resolves the handler set for an event with correct
 * I/O but does not invoke anything yet. Full wiring dispatches to each
 * matching `EventHandlerDefinition.handler` with error isolation.
 */

import type { EventHandlerDefinition } from "./types";

/**
 * Count handlers registered for `event` without invoking them.
 *
 * Placeholder: matching only — dispatch lands in the full implementation.
 * @param handlers - All registered event handlers.
 * @param event - Event name to match.
 * @param data - Payload that will be passed to handlers once wired.
 * @returns Number of handlers that would be invoked.
 * @example
 * const n = await emitPluginEvent(registry.getAllEventHandlers(), "chat.created");
 * // n === 0 (nothing invoked yet)
 */
export async function emitPluginEvent(
  handlers: EventHandlerDefinition[],
  event: string,
  data?: unknown,
): Promise<number> {
  void data;
  return handlers.filter((h,) => h.event === event,).length;
}
