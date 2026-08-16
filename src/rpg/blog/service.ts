// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Blog Service — thin barrel re-exporting the BlogService class and
 * its public types from the split dispatcher modules under ./service/.
 *
 * Kept at this path (instead of deleting it) because consumers import
 * `blog/service.js` WITH a `.js` extension; Bun resolves `.js` -> `.ts`
 * but not `.js` -> `dir/index.ts`, so the barrel must remain a file.
 */
export { BlogService, } from "./service/index";
export type {
  BlogAuthorType,
  BlogCommentRow,
  BlogCommentStatus,
  BlogFollowRow,
  BlogPostRow,
  BlogPostStatus,
  BlogPostVisibility,
  BlogPostWithTags,
  BlogRAGSourceRow,
  BlogRAGSourceType,
  BlogTagRow,
  CreateBlogPostInput,
  CreateCommentInput,
  UpdateBlogPostInput,
} from "./service/types";
