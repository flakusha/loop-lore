// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Solo-mode warning for plugin route access fields.
 *
 * Split out of `loader.ts` purely for the 250-line file budget — it needs
 * nothing private to the loader, only the registry and the global logger.
 *
 * @module plugin-solo-mode-warning
 */
import { getLogger, } from "../logger";
import { registry, } from "./registry";

/** Options for {@link warnIfAccessFieldsAreInert}. */
export interface LoadAllPluginsOpts {
  /**
   * Mirrors `config.auth.required`. Defaults to false, which is the app's own
   * default and therefore the safe (fail-loud) assumption.
   */
  authRequired?: boolean;
}

/**
 * Warn ONCE when enabled plugin routes declare `requiresAuth` / `permissions`
 * that the current auth mode cannot enforce.
 *
 * With `auth.required === false` (the app default) `authenticate` resolves
 * every request to the solo super-user, whose role holds `["*"]` — so neither
 * field can deny anything and the declarations are false assurance. This is a
 * deliberate non-change: treating `solo` as anonymous would break the
 * single-user UX. Surfacing it at boot is the honest alternative.
 *
 * Aggregated deliberately: one entry listing every affected route, never one
 * per route, so a plugin declaring twenty gated routes cannot flood the log.
 * @param opts - see {@link LoadAllPluginsOpts}
 * @returns How many enabled routes declared access fields (0 when nothing to say).
 */
export function warnIfAccessFieldsAreInert(opts: LoadAllPluginsOpts = {},): number {
  if (opts.authRequired === true) { return 0; }

  const affected = registry.getEnabledRoutes().filter((route,) => {
    return route.requiresAuth === true || (route.permissions?.length ?? 0) > 0;
  });

  if (affected.length === 0) { return 0; }

  try {
    getLogger().warn("plugin route access fields cannot be enforced in solo mode", {
      module: "authz",
      routeCount: affected.length,
      routes: affected.map((route,) => `${route.method} ${route.path}`,),
      hint: "auth.required is false, so authenticate() resolves every request to the solo super-user (role `solo`, permissions `*`). requiresAuth and permissions cannot deny anything here. Set auth.required=true to enforce them, and do row-level authorization inside the handler using its `caller` argument.",
    },);
  } catch {
    // Logger not initialised at boot — swallow; the warning is advisory.
  }

  return affected.length;
}
