// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/age-gate.ts — age-gate section defaults
import { AgeGateMode, } from "../../db/enums";
import type { AgeGateConfig, } from "../schema";

export const AGE_GATE_DEFAULTS = {
  enabled: false,
  minimumAge: 18,
  mode: AgeGateMode.SelfDeclaration,
} satisfies AgeGateConfig;
