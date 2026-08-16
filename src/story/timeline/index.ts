// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World Timeline — public API (docs/spec/lore.md §5).
 */
export {
  appendTimelineEvents,
  getEstablishedHistory,
  listTimelineEntries,
  seedBackstory,
} from "./world-timeline";
export type {
  AppendTimelineOpts,
  EstablishedHistoryOpts,
  ListTimelineOpts,
  SeedBackstoryOpts,
  TimelineEntry,
} from "./world-timeline";
