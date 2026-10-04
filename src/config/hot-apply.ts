// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/hot-apply.ts — Config change classification + propagation bus
//
// A config change (fs watcher edit or an API write) re-applies to running
// consumers without a restart:
//   1. `applyConfigChange(domain, config)` diffs the new Config against the
//      previous snapshot and classifies every changed leaf path.
//   2. Subscribers registered with `onConfigChange` receive the ConfigChange
//      and re-apply the live-applicable values (see hot-apply-consumers.ts).
//
// Classification is an explicit registry (`HOT_APPLY_PATHS`): a path is
// hot-applicable only when a consumer actually applies it live; everything
// else is restart-required by default. `requiresRestart` is surfaced to the
// admin API so the UI can flag edits that need a restart.

import type { Config, } from "./schema/config";

/** How a changed config path takes effect. */
export type ConfigChangeClass = "hot" | "restart";

/**
 * Config paths applied to live consumers without a restart.
 *
 * Adding an entry here REQUIRES a matching consumer branch in
 * `applyHotConfig` — the registry is a claim about wiring, not a wish.
 */
export const HOT_APPLY_PATHS: Readonly<Record<string, true>> = {
  "logging.level": true,
  "nsfw.allowNsfw": true,
  "nsfw.nsfwMinAge": true,
  "ageGate.enabled": true,
  "ageGate.minimumAge": true,
  "ageGate.mode": true,
};

/**
 * Classify a dotted config path.
 * @param path
 * @returns "hot" when a live consumer applies it, else "restart".
 */
export function classifyConfigPath(path: string,): ConfigChangeClass {
  return HOT_APPLY_PATHS[path] === true ? "hot" : "restart";
}

/** A classified config change emitted to subscribers. */
export interface ConfigChange {
  /** Domain file that triggered the reload, or "boot"/"api" for other writers. */
  domain: string;
  /** Full config after the change. */
  config: Config;
  /** Dotted leaf paths whose values differ from the previous snapshot. */
  changedPaths: string[];
  /** Changed paths applied live. */
  hotPaths: string[];
  /** Changed paths that need a process restart. */
  restartPaths: string[];
  /** True when at least one changed path needs a restart. */
  requiresRestart: boolean;
}

/** Subscriber invoked for every emitted config change. */
export type ConfigChangeHandler = (change: ConfigChange,) => void;

const handlers = new Set<ConfigChangeHandler>();
let previous: Config | null = null;

/**
 * @param value
 * @returns true for plain objects (arrays excluded — compared as leaves).
 */
function isPlainObject(value: unknown,): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value,);
}

/**
 * @param prev
 * @param next
 * @param prefix
 * @param out
 * @returns void
 */
function collectChangedPaths(prev: unknown, next: unknown, prefix: string, out: string[],): void {
  if (isPlainObject(prev,) && isPlainObject(next,)) {
    const keys = new Set([...Object.keys(prev,), ...Object.keys(next,),],);
    for (const key of keys) {
      collectChangedPaths(prev[key], next[key], prefix ? `${prefix}.${key}` : key, out,);
    }

    return;
  }

  if (prev !== next && !(Array.isArray(prev,) && Array.isArray(next,) && JSON.stringify(prev,) === JSON.stringify(next,))) {
    out.push(prefix,);
  }
}

/**
 * Seed the previous-config snapshot without emitting a change. Call at boot.
 * Without a snapshot the first `applyConfigChange` reports no changes (the
 * diff has no baseline), so subscribers are never fed a spurious full diff.
 * @param config
 * @returns void
 */
export function initConfigHotApply(config: Config,): void {
  previous = config;
}

/** Drop the snapshot and every subscriber. Test/dev only. */
export function resetConfigHotApply(): void {
  previous = null;
  handlers.clear();
}

/**
 * Subscribe to config changes.
 * @param handler
 * @returns Unsubscribe function.
 */
export function onConfigChange(handler: ConfigChangeHandler,): () => void {
  handlers.add(handler,);
  return () => {
    handlers.delete(handler,);
  };
}

/**
 * Diff `config` against the last snapshot, classify each changed path, and
 * notify subscribers. Seeding the snapshot on the first call (no baseline)
 * reports no changes.
 * @param domain
 * @param config
 * @returns The emitted change (also useful for callers that only want the diff).
 */
export function applyConfigChange(domain: string, config: Config,): ConfigChange {
  const changedPaths: string[] = [];
  if (previous) { collectChangedPaths(previous, config, "", changedPaths,); }
  previous = config;

  const hotPaths = changedPaths.filter((path,) => classifyConfigPath(path,) === "hot");
  const restartPaths = changedPaths.filter((path,) => classifyConfigPath(path,) === "restart");
  const change: ConfigChange = {
    domain,
    config,
    changedPaths,
    hotPaths,
    restartPaths,
    requiresRestart: restartPaths.length > 0,
  };

  if (changedPaths.length > 0) {
    for (const handler of handlers) { handler(change,); }
  }
  return change;
}
