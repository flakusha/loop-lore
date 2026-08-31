// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type {
  DifficultyClass,
} from "../integration-schemas";

/**
 * Get DC for common combat actions
 * @param action
 * @param targetLevel
 */
export function getCombatDC(
  action: "disarm" | "shove" | "grapple" | "escape_grapple" | "aim",
  targetLevel = 10,
): DifficultyClass {
  switch (action) {
    case "disarm": {
      return {
        name: "Disarm",
        value: 10 + targetLevel,
        description: "DC to disarm opponent",
      };
    }
    case "shove": {
      return {
        name: "Shove",
        value: 10 + Math.floor(targetLevel / 2,),
        description: "DC to shove opponent",
      };
    }
    case "grapple": {
      return {
        name: "Grapple",
        value: 10 + targetLevel,
        description: "DC to grapple opponent",
      };
    }
    case "escape_grapple": {
      return {
        name: "Escape Grapple",
        value: 10 + Math.floor(targetLevel / 2,),
        description: "DC to escape grapple",
      };
    }
    case "aim": {
      return {
        name: "Aim",
        value: 10 + targetLevel,
        description: "DC to aim for weak spot",
      };
    }
  }
}
