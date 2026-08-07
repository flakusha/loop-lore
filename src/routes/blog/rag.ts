import { Elysia, } from "elysia";
import type { TranslatorFn, } from "../../i18n/types";
import { BlogService, } from "../../rpg/blog/service.js";
import {
  BlogPostResponse,
  ErrorResponse,
  ListResponse,
  SuccessResponse,
} from "../../validation/schemas";
import { type HandlerOpts, } from "../actor-auth.js";
import { extractAuth, HttpStatus, jsonError, jsonResponse, } from "../http-utils.js";

export function blogRagRoutes(opts: HandlerOpts,) {
  const { database, } = opts;
  const svc = new BlogService(database,);

  return new Elysia({ name: "blog-rag", },)
    .get("/api/blog/posts/:id/sources", async (ctx: any,) => {
      const sources = await svc.getRAGSources(ctx.params.id,);
      return jsonResponse({ success: true, sources, count: sources.length, },);
    }, {
      response: {
        200: ListResponse(BlogPostResponse,),
      },
      detail: {
        summary: "List RAG sources",
        description: "List RAG (Retrieval-Augmented Generation) sources linked to a post.",
        tags: ["Blog",],
      },
    },)
    .post("/api/blog/posts/:id/sources", async (ctx: any,) => {
      const { userRole, } = extractAuth(ctx,);
      const t = ctx.t as TranslatorFn | undefined;
      if (userRole !== "admin") {
        return jsonError({ message: "errors.forbidden", status: HttpStatus.Forbidden, t, },);
      }

      const body = ctx.body as Record<string, unknown>;
      const source = await svc.addRAGSource(ctx.params.id, {
        source_type: body.source_type as any,
        uri: body.uri as string,
        title: body.title as string,
        relevance_score: (body.relevance_score as number) ?? 0,
        snippet: (body.snippet as string) ?? "",
      },);

      return jsonResponse({ success: true, source, },);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Add RAG source",
        description: "Add a RAG source to a blog post. Admin only.",
        tags: ["Blog",],
      },
    },);
}
