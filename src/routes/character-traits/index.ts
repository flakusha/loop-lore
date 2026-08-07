import { Elysia, } from "elysia";
import { bulkTraitsRoutes, } from "./bulk";
import { locationTraitsRoutes, } from "./location";
import { permanentTraitsRoutes, } from "./permanent";
import type { HandlerOpts, } from "./types";
import { worldTraitsRoutes, } from "./world";

/**
 * Character Traits Routes — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`character-traits`) is preserved so
 * the `register-plugins.ts` wiring is unchanged.
 */
export function characterTraitsRoutes(opts: HandlerOpts,) {
  return (
    new Elysia({ name: "character-traits", },)
      .use(permanentTraitsRoutes(opts,),)
      .use(worldTraitsRoutes(opts,),)
      .use(locationTraitsRoutes(opts,),)
      .use(bulkTraitsRoutes(opts,),)
  );
}
