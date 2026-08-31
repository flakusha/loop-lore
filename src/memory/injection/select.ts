// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Batch memory selection for injection.
 */
import type { MemoryEntry, } from "../types";
import { shouldInjectMemory, } from "./decide";
import {
  DEFAULT_COMFORT,
  type InjectionContext,
  type MemoryComfort,
  type MemoryInjectionConfig,
} from "./types";

/**
 * Evaluate a batch of memories for injection, respecting maxPerMessage.
 * @param memories - Candidate memories (should already be provision-filtered)
 * @param config - Injection configuration
 * @param ctx - Current injection context
 * @param comfort - Character comfort settings
 * @param injectionHistory - Map of memoryId → last turn injected
 * @returns Memories to inject, sorted by importance descending
 */
export function selectMemoriesForInjection(
  memories: MemoryEntry[],
  config: MemoryInjectionConfig,
  ctx: InjectionContext,
  comfort: MemoryComfort = DEFAULT_COMFORT,
  injectionHistory = new Map<string, number>(),
): { selected: MemoryEntry[]; rejected: { memory: MemoryEntry; reason: string; probability: number }[] } {
  const selected: MemoryEntry[] = [];
  const rejected: { memory: MemoryEntry; reason: string; probability: number }[] = [];

  // Sort by importance descending — most important first
  const sorted = [...memories,].sort((a, b,) => b.importance - a.importance);

  for (const memory of sorted) {
    if (selected.length >= config.maxPerMessage) {
      rejected.push({
        memory,
        reason: `max_per_message:${config.maxPerMessage}`,
        probability: 0,
      },);
      continue;
    }

    const lastTurn = injectionHistory.get(memory.id,) ?? -1;
    const decision = shouldInjectMemory(memory, config, ctx, comfort, lastTurn,);

    if (decision.inject) {
      selected.push(memory,);
    } else {
      rejected.push({
        memory,
        reason: decision.reason,
        probability: decision.probability,
      },);
    }
  }

  return { selected, rejected, };
}
