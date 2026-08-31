// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── SSE parser for Anthropic streaming ───────────────────
//
// Anthropic streams `event:` / `data:` line pairs. The `data` payload is JSON
// tagged by the preceding `event` name. This parser yields parsed events
// carrying the relevant fields for aggregation.

import { safeJsonParse, } from "../../../utils";
import type { AnthropicStreamEvent, } from "./types";

/** */
export interface AnthropicEventFrame {
  event: string;
  data: AnthropicStreamEvent;
}

/**
 * Parse a streamed Anthropic SSE chunk (an `event:` + `data:` line pair).
 * @param eventLine - e.g. `event: content_block_delta`
 * @param dataLine - e.g. `data: {"type":"content_block_delta",...}`
 * @returns A typed event frame, or `null` when the lines are not a valid pair
 */
export function parseAnthropicEvent(
  eventLine: string,
  dataLine: string,
): AnthropicEventFrame | null {
  const eventName = eventLine.slice("event:".length,).trim();
  if (!eventName) { return null; }

  const payload = dataLine.slice("data:".length,).trim();
  const parsed = safeJsonParse<AnthropicStreamEvent>(payload,);
  if (!parsed.ok) { return null; }

  return { event: eventName, data: parsed.value, };
}
