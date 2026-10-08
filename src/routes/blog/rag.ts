// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import type { TranslatorFn, } from "../../i18n/types";
import { BlogService, } from "../../rpg/blog/service.js";
import { can, } from "../../users/permissions";
import {
  BlogPostResponse,
  ErrorResponse,
  ListResponse,
  SuccessResponse,
} from "../../validation/schemas";
import { type HandlerOpts, } from "../actor-auth.js";
import { extractAuth, HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils.js";
import { isReadablePost, } from "./post-read-policy.js";
export const BlogRagSourcesListResponse = ListResponse(BlogPostResponse,);

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { blog: { posts: { ":id": { ...; }; }; }; }; } & { ...; }, { ...; }, { ...; }>}
 */
export function blogRagRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const svc = new BlogService(database,);

  return new Elysia({ name: "blog-rag", },)
    .get(`${prefix}/blog/posts/:id/sources`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { userRole, } = extractAuth(ctx,);
      const t = ctx.t as TranslatorFn | undefined;

      // Same post-level read policy as the rest of the blog surface: the
      // source list must not reveal a non-public post's existence nor its
      // private source URIs. Denials answer 404 (not 403) so post
      // existence is not leaked.
      const post = await svc.getPost(ctx.params.id,);
      if (post === undefined || !isReadablePost(post, userId, can(userRole, "admin.settings",),)) {
        return jsonError({ message: "errors.notFound", status: HttpStatus.NotFound, t, },);
      }

      const sources = await svc.getRAGSources(ctx.params.id,);
      return jsonResponse({ success: true, sources, count: sources.length, },);
    }, {
      response: {
        200: BlogRagSourcesListResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "List RAG sources",
        description: "List RAG (Retrieval-Augmented Generation) sources linked to a post.",
        tags: ["Blog",],
      },
    },)
    .post(`${prefix}/blog/posts/:id/sources`, async (ctx: any,) => {
      const { userRole, } = extractAuth(ctx,);
      const t = ctx.t as TranslatorFn | undefined;
      if (!can(userRole, "admin.settings",)) {
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
