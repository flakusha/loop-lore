import { capabilitiesState, } from "./capabilities";
import { pluginState, } from "./plugins";
import { providerState, } from "./providers";
import { roleState, } from "./roles";
import { sdState, } from "./sd";
import type { ModelsState, } from "./types";

/**
 * Composed admin-models state.
 *
 * The five domain sub-states (provider/role/plugin/sd/capabilities) together
 * provide every member of `ModelsState`. We cast through `unknown` because
 * spreading five `Partial<ModelsState>` sources keeps each member optional in
 * TS's eyes, but at runtime the merge yields the complete object.
 */
export const adminModels = {
  ...providerState,
  ...roleState,
  ...pluginState,
  ...sdState,
  ...capabilitiesState,
} as unknown as ModelsState;
