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
import { updateRuntimeNsfwConfig, } from "../nsfw/runtime-config";
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
      updateRuntimeNsfwConfig({
        allowNsfw: config.nsfw.allowNsfw,
        nsfwMinAge: config.nsfw.nsfwMinAge,
      },);
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
