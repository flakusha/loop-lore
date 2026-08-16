// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { SuccessResponse, } from "../../validation/schemas";
import { applyI18n, htmlResponse, } from "./layout";
import { serveStaticPartial, } from "./static-partials";

export function staticRoutes() {
  return new Elysia({ name: "views-static", },)
    .get("/partials/:page/:section", (ctx: any,) => {
      const isHtmx = ctx.request.headers.get("HX-Request",) === "true";
      if (!isHtmx) {
        return new Response(null, { status: 302, headers: { Location: "/views/", }, },);
      }
      const name = `${ctx.params.page}/${ctx.params.section}`;
      const url = new URL(ctx.request.url,);
      const content = serveStaticPartial(name, url.searchParams,);
      if (!content) { return new Response("Not found", { status: 404, },); }
      return htmlResponse(applyI18n(content, ctx.t,),);
    }, {
      response: { 200: SuccessResponse, },
    },);
}
