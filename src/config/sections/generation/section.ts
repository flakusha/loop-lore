// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type {
  GenerationConfig,
  GenerationProvidersConfig,
  ModelRoleAssignment,
} from "../../schema";
import { GENERATION_DEFAULTS, } from "./defaults.js";

/** */
export class GenerationSection implements GenerationConfig {
  providers: GenerationProvidersConfig = {
    openaiCompatible: [],
  };
  defaultProvider = GENERATION_DEFAULTS.defaultProvider;
  defaultModels: Record<string, string> = {};
  modelRoles: Record<string, ModelRoleAssignment> = {};
  autoStart: GenerationConfig["autoStart"];

  /**
   * @param overrides
   */
  constructor(overrides?: Partial<GenerationConfig>,) {
    if (!overrides) { return; }

    const { providers, ...rest } = overrides;
    Object.assign(this, rest,);
    if (providers) {
      this.providers = { ...this.providers, ...providers, };
    }
  }
}
