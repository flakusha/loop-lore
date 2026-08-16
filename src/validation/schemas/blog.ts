// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Blog route validation schemas.
 */

import { t, } from "elysia";

// ── Blog schemas ──────────────────────────────────────────

export const BlogPostCreateBody = t.Object({
  title: t.String({ minLength: 1, },),
  body: t.String({ minLength: 1, },),
  visibility: t.Optional(t.String(),),
  category: t.Optional(t.String(),),
  world_id: t.Optional(t.String({ format: "uuid", },),),
  character_id: t.Optional(t.String({ format: "uuid", },),),
},);

export const BlogPostUpdateBody = t.Object({
  title: t.Optional(t.String(),),
  body: t.Optional(t.String(),),
  visibility: t.Optional(t.String(),),
  category: t.Optional(t.String(),),
  status: t.Optional(t.String(),),
},);

export const BlogPostStatusBody = t.Object({
  status: t.String(),
},);

export const BlogCommentCreateBody = t.Object({
  body: t.String({ minLength: 1, },),
},);

export const BlogPostResponse = t.Object({
  id: t.String({ format: "uuid", },),
  title: t.String(),
  body: t.String(),
  author_id: t.String(),
  status: t.String(),
  visibility: t.String(),
  created_at: t.String(),
  updated_at: t.String(),
},);

export const BlogCommentResponse = t.Object({
  id: t.String({ format: "uuid", },),
  post_id: t.String(),
  author_id: t.String(),
  body: t.String(),
  status: t.String(),
  created_at: t.String(),
},);
