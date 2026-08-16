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
 *   GET    /api/:parentPrefix/:parentId/:entityPath       — list (paginated)
 *   POST   /api/:parentPrefix/:parentId/:entityPath       — create
 *   GET    /api/:parentPrefix/:parentId/:entityPath/:id   — get
 *   PUT    /api/:parentPrefix/:parentId/:entityPath/:id   — update
 *   DELETE /api/:parentPrefix/:parentId/:entityPath/:id   — delete
 */
export function createEntityRoutes(config: EntityConfig, opts: { database: Db; config: Config },): Elysia {
  return (
    new Elysia({ name: config.entityPath, },)
      .use(listRoutes(config, opts,),)
      .use(createRoutes(config, opts,),)
      .use(getRoutes(config, opts,),)
      .use(updateRoutes(config, opts,),)
      .use(removeRoutes(config, opts,),)
  );
}
