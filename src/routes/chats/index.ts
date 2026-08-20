import { Elysia, } from "elysia";
import { safeJsonParse, } from "../../utils";
import { batchRoutes, } from "./batch";
import { createRoutes, } from "./create";
import { extrasRoutes, } from "./extras";
import { listRoutes, } from "./list";
import { manageRoutes, } from "./manage";
import { participantRoutes, } from "./participants";
import { sideChannelRoutes, } from "./side-channels";
import { partySplitRoutes, } from "./split";
import { templatesRoutes, } from "./templates";
import { turnOrderRoutes, } from "./turn-order";
import type { HandlerOpts, } from "./types";
import { vnChoiceRoutes, } from "./vn-choices";

export function chatsRoutes(opts: HandlerOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "chats", },)
      .onParse(async (ctx: any, contentType: string,) => {
        if (!contentType.includes("application/json",)) {
          return;
        }
        const text = await ctx.request.text();
        (ctx as { rawBodyText?: string }).rawBodyText = text;
        const parsed = safeJsonParse(text,);
        if (!parsed.ok) { throw parsed.error; }
        return parsed.value;
      },)
      .use(listRoutes(opts, prefix,),)
      .use(createRoutes(opts, prefix,),)
      .use(templatesRoutes(opts, prefix,),)
      .use(batchRoutes(opts, prefix,),)
      .use(manageRoutes(opts, prefix,),)
      .use(participantRoutes(opts, prefix,),)
      .use(sideChannelRoutes(opts, prefix,),)
      .use(turnOrderRoutes(opts, prefix,),)
      .use(partySplitRoutes(opts, prefix,),)
      .use(vnChoiceRoutes(opts, prefix,),)
      .use(extrasRoutes(opts, prefix,),)
  );
}
