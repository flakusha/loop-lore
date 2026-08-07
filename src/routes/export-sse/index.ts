import { Elysia, } from "elysia";
import { downloadRoutes, } from "./download";
import { startRoutes, } from "./start";
import { statusRoutes, } from "./status";
import type { HandlerOpts, } from "./types";

export function exportSseRoutes({ database, }: HandlerOpts,): Elysia {
  return new Elysia({ name: "export-sse", },)
    .use(startRoutes({ database, },),)
    .use(downloadRoutes({ database, },),)
    .use(statusRoutes({ database, },),);
}
