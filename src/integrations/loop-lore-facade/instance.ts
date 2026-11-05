// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/instance.ts — process-wide facade op
// registry singleton, mirroring the governanceRateLimiter singleton style
// (src/api-governance/rate-limiting/instance.ts): built lazily by the first
// HTTP surface that needs it, resettable so tests can rebuild against their
// own :memory: database.

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { registerChatOps, } from "./ops/chat";
import { registerGenerationOps, } from "./ops/generation";
import { createFacadeRegistry, type FacadeRegistry, } from "./registry";

/** Deps the singleton ops close over — the app's handles, bound once. */
export interface FacadeRegistryDeps {
  database: Kysely<DB>;
  config: Config;
}

let singleton: FacadeRegistry | null = null;

/**
 * Process-wide facade registry (one per server process). Built ONCE with the
 * first caller's deps — server boot passes the same database/config to every
 * plugin instance; tests call {@link resetFacadeRegistry} before each build
 * so the ops re-bind to the current test database.
 * @param deps - database/config the chat + generation ops close over
 * @returns the shared registry with every op registered
 */
export function getFacadeRegistry(deps: FacadeRegistryDeps,): FacadeRegistry {
  if (!singleton) {
    const registry = createFacadeRegistry();
    registerChatOps(registry, deps,);
    registerGenerationOps(registry, deps,);
    singleton = registry;
  }

  return singleton;
}

/** Drop the singleton so the next {@link getFacadeRegistry} rebuilds it. */
export function resetFacadeRegistry(): void {
  singleton = null;
}
