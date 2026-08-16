// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import type { Config, } from "../../../config/schema";
import { discoverRoutes, } from "./discover";
import { loraManagementRoutes, } from "./management";
import { loraValidateRoutes, } from "./validate";

// ── URL resolution (re-exported for tests) ──────────────
export { resolveBackendUrls, } from "./urls";

// ── Elysia Plugin facade ────────────────────────────────

/**
 * LoRA routes plugin — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`lora`) is preserved so wiring in
 * `elysia-app.ts` / `register-plugins.ts` is unchanged.
 *
 * TODO: Register in elysia-app.ts when LoRA feature is ready for production.
 * All LoRA routes are gated behind auth check.
 */
export function loraRoutes({ config, }: { config: Config },) {
  return (
    new Elysia({ name: "lora", },)
      .use(discoverRoutes(config,),)
      .use(loraManagementRoutes(),)
      .use(loraValidateRoutes(),)
  );
}
