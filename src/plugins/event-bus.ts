// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin EventBus dispatch (FEAT-048).
 *
 * Invokes every handler registered for `event` in registration order with
 * error isolation: a throwing handler is reported via `onError` and does
 * not prevent later handlers from running.
 */

import type { EventHandlerDefinition } from "./types";

/** Options for {@link emitPluginEvent}. */
export interface EmitOptions {
  /** Called for each handler that throws; defaults to silent. */
  onError?: (error: unknown, handler: EventHandlerDefinition) => void;
}

/**
 * Dispatch `event` to all matching handlers.
 * @param handlers - All registered event handlers.
 * @param event - Event name to match.
 * @param data - Payload passed to each handler.
 * @param opts - Optional error reporter.
 * @returns Number of matching handlers invoked (including ones that threw).
 * @example
 * const n = await emitPluginEvent(registry.getAllEventHandlers(), "chat.created", chat);
 */
export async function emitPluginEvent(
  handlers: EventHandlerDefinition[],
  event: string,
  data?: unknown,
  opts?: EmitOptions,
): Promise<number> {
  let invoked = 0;
  for (const handler of handlers) {
    if (handler.event !== event) continue;
    invoked += 1;
    try {
      await handler.handler(data);
    } catch (error) {
      opts?.onError?.(error, handler);
    }
  }
  return invoked;
}
