import { pluginState, } from "./plugins";
import { providerState, } from "./providers";
import { roleState, } from "./roles";
import { sdState, } from "./sd";
import type { ModelsState, } from "./types";

/**
 * Composed admin-models state.
 *
 * The four domain sub-states (provider/role/plugin/sd) together provide every
 * member of `ModelsState`. We cast through `unknown` because spreading four
 * `Partial<ModelsState>` sources keeps each member optional in TS's eyes, but
 * at runtime the merge yields the complete object. Consumers (admin.ts) rely on
 * the full type so their `this.loadModels()` etc. resolve as present.
 */
export const adminModels = {
  ...providerState,
  ...roleState,
  ...pluginState,
  ...sdState,
} as unknown as ModelsState;
