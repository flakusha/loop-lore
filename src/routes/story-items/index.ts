// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { storyItemDefinitionsRoutes, } from "./definitions";
import { storyItemInstanceRoutes, } from "./instances";

/**
 * Story Items route module — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`story-items`) is preserved so the
 * `elysia-app.ts` wiring is unchanged.
 */
export function storyItemsRoutes({ database, }: { database: Kysely<DB> },): Elysia {
  return new Elysia({ name: "story-items", },)
    .use(storyItemInstanceRoutes({ database, },),)
    .use(storyItemDefinitionsRoutes({ database, },),);
}
