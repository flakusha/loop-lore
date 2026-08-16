// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { type HandlerOpts, } from "../actor-auth.js";
import { blogCommentRoutes, } from "./comments";
import { blogFollowRoutes, } from "./follows";
import { blogModerationRoutes, } from "./moderation";
import { blogPostRoutes, } from "./posts";
import { blogRagRoutes, } from "./rag";

/**
 * Blog route module — barrel assembling the HTTP surface from domain
 * sub-plugins. Registration point/name (`blog`) is preserved so the
 * `register-plugins.ts` wiring is unchanged.
 */
export function blogRoutes(opts: HandlerOpts,) {
  return (
    new Elysia({ name: "blog", },)
      .use(blogPostRoutes(opts,),)
      .use(blogCommentRoutes(opts,),)
      .use(blogModerationRoutes(opts,),)
      .use(blogFollowRoutes(opts,),)
      .use(blogRagRoutes(opts,),)
  );
}
