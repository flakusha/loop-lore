// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
} satisfies GenerationConfig;
