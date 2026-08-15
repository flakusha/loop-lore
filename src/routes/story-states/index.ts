import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { storyLocationStateRoutes, } from "./location";
import { storyNpcStateRoutes, } from "./npc";
import { storyWorldStateRoutes, } from "./world-states";

/**
 * Story State route module — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`story-states`) is preserved so the
 * `elysia-app.ts` wiring is unchanged.
 */
export function storyStatesRoutes({ database, }: { database: Kysely<DB> },): Elysia {
  return new Elysia({ name: "story-states", },)
    .use(storyNpcStateRoutes({ database, },),)
    .use(storyLocationStateRoutes({ database, },),)
    .use(storyWorldStateRoutes({ database, },),);
}
