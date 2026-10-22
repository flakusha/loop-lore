// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

export {
  ASI_LEVELS,
  ASI_MAX,
  AVG_HP_BY_DIE,
  HP_PER_LEVEL,
  MAX_LEVEL,
  XP_BY_LEVEL,
} from "./constants.js";

export {
  awardXp,
  canLevelUp,
  levelFromXp,
  xpForLevel,
  xpToNextLevel,
} from "./calculation.js";

export {
  DISCOVERY_XP,
  isXpSource,
  TRAVEL_LEG_XP,
  XP_BY_CR,
  xpForDiscovery,
  xpForEnemyDefeat,
  xpForQuest,
  xpForSkillChallenge,
  xpForTravelLeg,
  XpSource,
} from "./sources.js";

export {
  asiRemaining,
  grantsAsi,
  hpOnLevelUp,
} from "./levelup.js";
