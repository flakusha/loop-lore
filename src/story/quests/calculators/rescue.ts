// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { RescueQuestConfig, } from "../../types";
import type { ProgressCalculator, } from "../types";

export const calculateRescueProgress: ProgressCalculator = (ctx, config, event,) => {
  if (!config) { return 0; }
  if (event.type !== "location_change") { return 0; }
  const cfg = config as RescueQuestConfig;
  if (event.actorId === cfg.targetActorId && event.locationId === cfg.safeLocationId) {
    return 100 - ctx.progress;
  }
  return 0;
};
