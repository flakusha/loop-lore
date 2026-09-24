// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { BlogPostRow, } from "../../rpg/blog/service/types";
import { BlogPostStatus, BlogPostVisibility, } from "../../rpg/blog/service/types";

/** Minimal post fields the policy needs. */
type PolicyPost = Pick<BlogPostRow, "visibility" | "status" | "author_id">;

/**
 * Row-level read policy for blog posts (BUG-blog-post-get-bypasses-
 * visibility-policy, BUG-blog-comments-post-accepts-non-public-posts):
 * a post is readable only when it is public AND published, when the caller
 * is its author, or when the caller is an admin. Callers answer denials
 * with 404 (not 403) so post existence is not leaked. Shared by the post
 * GET route, the comments POST route, and the list-route gating so the
 * three cannot drift.
 * @param post
 * @param userId
 * @param isAdmin
 */
export function isReadablePost(
  post: PolicyPost,
  userId: string,
  isAdmin: boolean,
): boolean {
  return (post.visibility === BlogPostVisibility.Public &&
    post.status === BlogPostStatus.Published) ||
    post.author_id === userId ||
    isAdmin;
}
