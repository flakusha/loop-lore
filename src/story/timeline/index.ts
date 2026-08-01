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
