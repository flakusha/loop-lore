// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI builder routes facade (Track A) — assembles the HTTP surface:
 *
 *   Chains:   src/routes/comfyui-builder/chains.ts
 *   Run:      src/routes/comfyui-builder/run.ts
 *   Palette:  src/routes/comfyui-builder/palette.ts
 *   Validate: src/routes/comfyui-builder/validate.ts
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { StepRunner, } from "../../generation/builder";
import { builderChainRoutes, } from "./chains";
import { builderPaletteRoutes, } from "./palette";
import { builderRunRoutes, } from "./run";
import { builderValidateRoutes, } from "./validate";

/** Builder route options. */
export interface ComfyuiBuilderRouteOpts {
  database: Kysely<DB>;
  /** Test seam for the run executor — defaults to the `handleRun` delegate. */
  executeStep?: StepRunner;
}

/**
 * @param opts - Handler options
 * @param prefix - Route prefix
 * @returns the Elysia plugin mounting every builder route
 */
export function comfyuiBuilderRoutes(
  opts: ComfyuiBuilderRouteOpts,
  prefix = "/api",
) {
  return new Elysia({ name: "comfyui-builder", },)
    .use(builderChainRoutes(opts, prefix,),)
    .use(builderRunRoutes(opts, prefix,),)
    .use(builderPaletteRoutes(prefix,),)
    .use(builderValidateRoutes(prefix,),);
}
