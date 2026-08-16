// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Dice Roller Plugin — Core plugin shipped with loop-lore
 *
 * Registers POST /api/dice/roll for RPG dice notation.
 * Used as a sample / default plugin implementation.
 *
 * License: Apache-2.0 OR MIT
 */

import type { PluginManifest } from "../../../src/plugins/types";
import { handleRoll } from "./routes";

export const plugin: PluginManifest = {
  name: "dice-roller",
  version: "1.0.0",
  description: "RPG dice rolling (e.g. 2d6+3, d20, 3d8-2) with text-command detection",
  author: "loop-lore team",
  license: "Apache-2.0 OR MIT",

  async onLoad(context) {
    context.registerApiRoute({
      method: "POST",
      path: "/api/dice/roll",
      handler: handleRoll,
    });
  },
};