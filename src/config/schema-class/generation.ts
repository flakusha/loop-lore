// src/config/schema-class/generation.ts — generation section defaults
import type {
  GenerationConfig,
  GenerationProvidersConfig,
  ModelRoleAssignment,
  ProviderInstanceConfig,
  RegexTransform,
} from "../schema";

export const GENERATION_DEFAULTS = {
  providers: {
    openaiCompatible: [] as ProviderInstanceConfig[],
  } satisfies GenerationProvidersConfig,
  defaultProvider: "",
  defaultModels: {} as Record<string, string>,
  modelRoles: {} as Record<string, ModelRoleAssignment>,
  regexTransforms: [] as RegexTransform[],
} satisfies GenerationConfig;
