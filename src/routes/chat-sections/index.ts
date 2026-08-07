import { Elysia, } from "elysia";
import { assignRoutes, } from "./assign";
import { createRoutes, } from "./create";
import { listRoutes, } from "./list";
import { removeRoutes, } from "./remove";
import { reorderRoutes, } from "./reorder";
import type { HandlerOpts, } from "./types";
import { updateRoutes, } from "./update";

/**
 * Chat sections facade — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`chat-sections`) is preserved so the
 * `register-plugins.ts` wiring is unchanged.
 */
export function chatSectionsRoutes(opts: HandlerOpts,) {
  return (
    new Elysia({ name: "chat-sections", },)
      .use(listRoutes(opts,),)
      .use(createRoutes(opts,),)
      .use(updateRoutes(opts,),)
      .use(removeRoutes(opts,),)
      .use(reorderRoutes(opts,),)
      .use(assignRoutes(opts,),)
  );
}
