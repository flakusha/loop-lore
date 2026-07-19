import type { TimeQuestConfig, } from "../../types";
import type { ProgressCalculator, } from "../types";

export const calculateTimeProgress: ProgressCalculator = (_ctx, config, event,) => {
  if (!config) { return 0; }
  if (event.type !== "time_advancement") { return 0; }
  const cfg = config as TimeQuestConfig;
  const minutes = typeof event.data.minutesAdvanced === "number" ? event.data.minutesAdvanced : 60;
  return Math.round((minutes / cfg.durationMinutes) * 100,);
};
