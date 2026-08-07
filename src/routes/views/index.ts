import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { dynamicRoutes, } from "./plugin-dynamic";
import { pagesRoutes, } from "./plugin-pages";
import { staticRoutes, } from "./plugin-static";

export { applyI18n, } from "./layout";
export { serveView, } from "./view-serving";

/**
 * View route module — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`views`) is preserved so the
 * `elysia-app.ts` wiring is unchanged.
 */
export function viewRoutes({ database, }: { database: Kysely<DB> },) {
  return new Elysia({ name: "views", },)
    .use(staticRoutes(),)
    .use(dynamicRoutes(database,),)
    .use(pagesRoutes(database,),);
}
