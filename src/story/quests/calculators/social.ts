// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { SocialQuestConfig, } from "../../types";
import type { ProgressCalculator, } from "../types";

export const calculateSocialProgress: ProgressCalculator = (_ctx, config, event,) => {
  if (!config) { return 0; }
  if (event.type !== "npc_state_change") { return 0; }
  const cfg = config as SocialQuestConfig;
  const npcId = typeof event.data.npcActorId === "string" ? event.data.npcActorId : event.actorId;
  if (npcId === cfg.targetActorId) {
    return Math.round(100 / cfg.requiredInteractions,);
  }
  return 0;
};
