// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { QuestConfig, WorldEvent, } from "../types";

export interface ProgressCalcContext {
  progress: number;
  target: number;
}

export type ProgressCalculator = (
  ctx: ProgressCalcContext,
  config: QuestConfig | null,
  event: WorldEvent,
) => number;
