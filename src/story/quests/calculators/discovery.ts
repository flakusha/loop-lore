// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { DiscoveryQuestConfig, } from "../../types";
import type { ProgressCalculator, } from "../types";

export const calculateDiscoveryProgress: ProgressCalculator = (ctx, config, event,) => {
  if (!config) { return 0; }
  if (event.type !== "location_change") { return 0; }
  const cfg = config as DiscoveryQuestConfig;
  if (event.locationId === cfg.targetLocationId) {
    return 100 - ctx.progress;
  }
  if (cfg.clues.some((c,) => c.locationId === event.locationId)) {
    return Math.round(100 / (cfg.clues.length + 1),);
  }
  return 0;
};
