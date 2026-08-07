// src/config/schema-class/ageGate.ts — age-gate section defaults
import { AgeGateMode, } from "../../db/enums";
import type { AgeGateConfig, } from "../schema";

export const AGE_GATE_DEFAULTS = {
  enabled: false,
  minimumAge: 18,
  mode: AgeGateMode.SelfDeclaration,
} satisfies AgeGateConfig;
