import type { DestructionQuestConfig, } from "../../types";
import type { ProgressCalculator, } from "../types";

export const calculateDestructionProgress: ProgressCalculator = (_ctx, config, event,) => {
  if (!config) { return 0; }
  if (event.type !== "combat_event") { return 0; }
  const defeated = typeof event.data.defeated === "boolean" && event.data.defeated;
  if (!defeated) { return 0; }
  const cfg = config as DestructionQuestConfig;
  if (cfg.targetActorId) {
    if (typeof event.data.defenderId !== "string") { return 0; }
    return event.data.defenderId === cfg.targetActorId ? 1 : 0;
  }
  return cfg.targetQuantity && cfg.targetQuantity > 0 ? Math.round(100 / cfg.targetQuantity,) : 0;
};
