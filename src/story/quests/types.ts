import type { QuestConfig, WorldEvent } from "../types";

export interface ProgressCalcContext {
  progress: number;
  target: number;
}

export type ProgressCalculator = (
  ctx: ProgressCalcContext,
  config: QuestConfig | null,
  event: WorldEvent,
) => number;
