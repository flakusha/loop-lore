import { Elysia, } from "elysia";
import { cardRoutes, } from "./card";
import { createRoutes, } from "./create";
import { exportRoutes, } from "./export";
import { listRoutes, } from "./list";
import { readRoutes, } from "./read";
import { removeRoutes, } from "./remove";
import type { HandlerOpts, } from "./types";
import { updateRoutes, } from "./update";

/**
 * Characters route module — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`characters`) is preserved so the
 * `elysia-app.ts` wiring is unchanged.
 */
export function charactersRoutes(opts: HandlerOpts,) {
  return new Elysia({ name: "characters", },)
    .use(listRoutes(opts,),)
    .use(createRoutes(opts,),)
    .use(readRoutes(opts,),)
    .use(cardRoutes(opts,),)
    .use(updateRoutes(opts,),)
    .use(removeRoutes(opts,),)
    .use(exportRoutes(opts,),);
}
