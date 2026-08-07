import { Elysia, } from "elysia";
import { eventsRoutes, } from "./events";
import { stateRoutes, } from "./state";
import type { HandlerOpts, } from "./types";

/**
 * Character Mood Routes — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`character-mood`) is preserved so
 * the `register-plugins.ts` wiring is unchanged.
 */
export function characterMoodRoutes(opts: HandlerOpts,) {
  return (
    new Elysia({ name: "character-mood", },)
      .use(stateRoutes(opts,),)
      .use(eventsRoutes(opts,),)
  );
}
