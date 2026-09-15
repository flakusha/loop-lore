// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import type { Config, } from "../../config/schema";
import type { Db, } from "../../db";
import { createRoutes, } from "./create";
import { getRoutes, } from "./get";
import { listRoutes, } from "./list";
import { removeRoutes, } from "./remove";
import type { EntityConfig, } from "./types";
import { updateRoutes, } from "./update";

export type { EntityConfig, } from "./types";

/**
 * Entity Routes Factory for Elysia — barrel assembling the generic CRUD
 * sub-plugins under the configured `entityPath` name so consumers of
 * `createEntityRoutes` are unchanged.
 *
 *   GET    {prefix}/:parentPrefix/:parentId/:entityPath       — list (paginated)
 *   POST   {prefix}/:parentPrefix/:parentId/:entityPath       — create
 *   GET    {prefix}/:parentPrefix/:parentId/:entityPath/:id   — get
 *   PUT    {prefix}/:parentPrefix/:parentId/:entityPath/:id   — update
 *   DELETE {prefix}/:parentPrefix/:parentId/:entityPath/:id   — delete
 * @param config
 * @param opts
 * @param opts.database
 * @param opts.config
 * @param prefix
 */
export function createEntityRoutes(
  config: EntityConfig,
  opts: { database: Db; config: Config },
  prefix = "/api",
): Elysia {
  return (
    new Elysia({ name: config.entityPath, },)
      .use(listRoutes(config, opts, prefix,),)
      .use(createRoutes(config, opts, prefix,),)
      .use(getRoutes(config, opts, prefix,),)
      .use(updateRoutes(config, opts, prefix,),)
      .use(removeRoutes(config, opts, prefix,),)
  );
}
