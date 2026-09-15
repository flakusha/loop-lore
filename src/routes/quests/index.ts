// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { questProgressRoutes, } from "./progress";
import { questCrudRoutes, } from "./quest";
import { questWorldRoutes, } from "./world";

/**
 * Quest route module — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`quests`) is preserved so the
 * `elysia-app.ts` wiring is unchanged.
 * @param root0
 * @param root0.database
 */
export function questsRoutes({ database, }: { database: Kysely<DB> }, prefix = "/api",): Elysia {
  return new Elysia({ name: "quests", },)
    .use(questWorldRoutes({ database, }, prefix,),)
    .use(questCrudRoutes({ database, }, prefix,),)
    .use(questProgressRoutes({ database, }, prefix,),);
}
