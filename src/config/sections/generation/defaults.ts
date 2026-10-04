// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { GenerationRoutingConfig, } from "../../../generation/routing/routing-config";
import type {
  GenerationConfig,
  GenerationProvidersConfig,
  ModelRoleAssignment,
  ProviderInstanceConfig,
} from "../../schema";

export const GENERATION_PROVIDERS_DEFAULTS = {
  openaiCompatible: [] as ProviderInstanceConfig[],
} satisfies GenerationProvidersConfig;

export const GENERATION_DEFAULTS = {
  providers: GENERATION_PROVIDERS_DEFAULTS,
  defaultProvider: "",
  defaultModels: {} as Record<string, string>,
  modelRoles: {} as Record<string, ModelRoleAssignment>,
  chatDefaults: { outputStyle: null, },
  // capability-match scores 0 for every unannotated candidate, so the default
  // leaves the pre-routing config order untouched.
  routing: { strategy: "capability-match", } satisfies GenerationRoutingConfig,
} satisfies GenerationConfig;
