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
} satisfies GenerationConfig;
