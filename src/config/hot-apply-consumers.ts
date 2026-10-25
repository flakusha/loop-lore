// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/hot-apply-consumers.ts — Live consumers for hot-applicable config
//
// Each branch maps a `HOT_APPLY_PATHS` entry onto the runtime store that
// consumer actually reads. Only paths present in `change.hotPaths` are applied,
// so an unrelated reload never clobbers an admin override (e.g. the NSFW
// toggle) with the on-disk value.

import { ageGateConfig, } from "../age-gate/controller";
import { getLogger, } from "../logger";
import {
  type NsfwRuntimeConfig,
  updateRuntimeNsfwConfig,
  updateRuntimeNsfwFileConfig,
} from "../nsfw/runtime-config";
import type { ConfigChange, } from "./hot-apply";

/**
 * Re-apply the live-applicable values from a config change.
 * Register with `onConfigChange(applyHotConfig)` at boot.
 * @param change
 * @returns void
 */
export function applyHotConfig(change: ConfigChange,): void {
  const { config, hotPaths, } = change;

  for (const path of hotPaths) {
    if (path === "logging.level") {
      getLogger().setLevel(config.logging.level,);
    } else if (path === "nsfw.allowNsfw" || path === "nsfw.nsfwMinAge") {
      // Enforcement reads the runtime store, not the per-request file config.
      applyNsfwHotPath(path, config, change.domain,);
    } else if (path.startsWith("ageGate.",)) {
      // Chat creation reads the runtime store on every request.
      ageGateConfig.update({
        enabled: config.ageGate.enabled,
        minimumAge: config.ageGate.minimumAge,
        mode: config.ageGate.mode,
      },);
    }
  }

  if (hotPaths.length > 0) {
    getLogger().info("applied hot config change", {
      module: "config-hot-apply",
      domain: change.domain,
      hotPaths,
      restartPaths: change.restartPaths,
    },);
  }
}

/**
 * Apply an NSFW hot path to the runtime store.
 *
 * A `system_config` write is an admin override (persisted, re-applied at
 * startup); a config-file reload only refreshes the file layer. Keeping the
 * layers apart is what stops a reload from re-enabling NSFW after the admin
 * turned it off.
 * @param path
 * @param config
 * @param domain
 * @returns void
 */
function applyNsfwHotPath(path: string, config: ConfigChange["config"], domain: string,): void {
  const patch: Partial<NsfwRuntimeConfig> = {};
  if (path === "nsfw.allowNsfw") { patch.allowNsfw = config.nsfw.allowNsfw; }
  if (path === "nsfw.nsfwMinAge") { patch.nsfwMinAge = config.nsfw.nsfwMinAge; }

  if (domain === "system_config") {
    updateRuntimeNsfwConfig(patch,);
  } else {
    updateRuntimeNsfwFileConfig(patch,);
  }
}
