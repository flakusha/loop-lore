// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Config, } from "../config/schema";
import { type FeatureSurface, resolveFeatures, } from "./resolve";
export type { FeatureSurface, } from "./resolve";

/** Options shared by the route barrels and the unversioned plugin mount. */
export interface FeatureOpts {
  config: Config;
  features?: FeatureSurface;
}

/** Resolve the capability surface once; injected features win over config. */
export function featuresForOpts(opts: FeatureOpts,): FeatureSurface {
  return opts.features ?? resolveFeatures(opts.config?.features?.profile ?? "full",);
}
