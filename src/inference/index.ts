// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser-side inference (opt-in BYOK local-models slice).
 *
 * Server advertises which auxiliary tasks may run locally; the browser
 * engine (`src/frontend/alpine/local-inference.ts`) runs them when the user
 * opts in and falls back to the server otherwise.
 *
 * @module inference
 */

export {
  BROWSER_MODEL_CATALOG,
  buildLocalInferenceManifest,
  ELIGIBLE_LOCAL_TASKS,
  isEligibleLocalTask,
  isLocalOnlyLevel,
  isModelDownloadable,
  LOCAL_ONLY_LEVELS,
} from "./manifest";
export type {
  LocalInferenceManifest,
  LocalInferenceTask,
  LocalModelDescriptor,
  LocalModelDownloadOverride,
  LocalModelDownloadPolicy,
  LocalOnlyLevel,
} from "./manifest";
export { localInferenceRoutes, } from "./routes";
