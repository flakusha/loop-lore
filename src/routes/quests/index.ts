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
 */
export function questsRoutes({ database, }: { database: Kysely<DB> },): Elysia {
  return (
    new Elysia({ name: "quests", },)
      .use(questWorldRoutes({ database, },),)
      .use(questCrudRoutes({ database, },),)
      .use(questProgressRoutes({ database, },),)
  ) as unknown as Elysia;
}
