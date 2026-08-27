// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Resolve actorId from the hook event payload. The MoodHook and EmotionHook
 * emit actorId in their data payload; this helper extracts it so consumers
 * don't need to thread actorId through ambient context.
 */
export function resolveActorIdFromEvents(
  events: readonly { eventType: string; data?: Record<string, unknown> }[],
): string | undefined {
  for (const event of events) {
    if (event.data && typeof event.data.actorId === "string" && event.data.actorId.length > 0) {
      return event.data.actorId;
    }
  }
  return undefined;
}
