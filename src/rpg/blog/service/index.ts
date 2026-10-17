// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Blog service: posts, comments, follows, RAG sources. */
import {
  createComment as createCommentDispatch,
  getComment as getCommentDispatch,
  listComments as listCommentsDispatch,
  listCommentsThreaded as listCommentsThreadedDispatch,
  moderateComment as moderateCommentDispatch,
} from "./comments";
import { BlogFollowsService, } from "./follows-service";
import {
  createPost as createPostDispatch,
  deletePost as deletePostDispatch,
  getPost as getPostDispatch,
  incrementViewCount as incrementViewCountDispatch,
  listPosts as listPostsDispatch,
  updatePost as updatePostDispatch,
} from "./posts";
import type {
  BlogCommentRow,
  BlogCommentStatus,
  BlogCommentWithChildren,
  BlogPostRow,
  BlogPostStatus,
  BlogPostVisibility,
  BlogPostWithTags,
  CreateBlogPostInput,
  CreateCommentInput,
  UpdateBlogPostInput,
} from "./types";

export type {
  BlogAuthorType,
  BlogCommentRow,
  BlogCommentStatus,
  BlogCommentWithChildren,
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
} from "./types";

// ── Service ──────────────────────────────────────
/** */
export class BlogService extends BlogFollowsService {
  // ── Posts ────────────────────────────────────
  /**
   * Create a post.
   * @param input
   * @returns the stored post row
   */
  async createPost(input: CreateBlogPostInput,): Promise<BlogPostRow> {
    return createPostDispatch(this.db, input,);
  }

  /**
   * Get a post by ID.
   * @param id
   * @returns the post with its tags, or undefined when no such post exists
   */
  async getPost(id: string,): Promise<BlogPostWithTags | undefined> {
    return getPostDispatch(this.db, id,);
  }

  /**
   * List posts with optional filters.
   * @param filters
   * @param filters.author_id
   * @param filters.visibility
   * @param filters.status
   * @param filters.category
   * @param filters.world_id
   * @param filters.limit
   * @param filters.offset
   * @param filters.userId
   * @returns posts matching every supplied filter, newest first
   */
  async listPosts(filters: {
    author_id?: string;
    visibility?: BlogPostVisibility;
    status?: BlogPostStatus;
    category?: string;
    world_id?: string;
    limit?: number;
    offset?: number;
    userId?: string;
  },): Promise<BlogPostWithTags[]> {
    return listPostsDispatch(this.db, filters,);
  }

  /**
   * Update a post. The caller must be the author or an admin.
   * @param id
   * @param input
   * @param callerUserId
   * @param isAdmin
   * @returns the updated post, or undefined when it is missing or the caller is neither author nor admin
   */
  async updatePost(
    id: string,
    input: UpdateBlogPostInput,
    callerUserId: string,
    isAdmin = false,
  ): Promise<BlogPostRow | undefined> {
    return updatePostDispatch(this.db, id, input, callerUserId, isAdmin,);
  }

  /**
   * Delete a post. The caller must be the author or an admin.
   * @param id
   * @param callerUserId
   * @param isAdmin
   * @returns true when the post was deleted
   */
  async deletePost(id: string, callerUserId: string, isAdmin = false,): Promise<boolean> {
    return deletePostDispatch(this.db, id, callerUserId, isAdmin,);
  }
  /**
   * Increment a post's view count.
   * @param id
   * @returns nothing; the counter is bumped in place
   */
  async incrementViewCount(id: string,): Promise<void> {
    return incrementViewCountDispatch(this.db, id,);
  }

  // ── Comments ─────────────────────────────────
  /**
   * Create a comment.
   * @param input
   * @returns the stored comment row
   */
  async createComment(input: CreateCommentInput,): Promise<BlogCommentRow> {
    return createCommentDispatch(this.db, input,);
  }

  /**
   * Get a comment.
   * @param id
   * @returns the comment, or undefined when no such comment exists
   */
  async getComment(id: string,): Promise<BlogCommentRow | undefined> {
    return getCommentDispatch(this.db, id,);
  }

  /**
   * List comments for a post.
   * @param postId
   * @param opts
   * @param opts.limit
   * @param opts.offset
   * @returns a flat page of the post's comments
   */
  async listComments(
    postId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<BlogCommentRow[]> {
    return listCommentsDispatch(this.db, postId, opts,);
  }

  /**
   * List threaded comments for a post.
   * @param postId
   * @param opts
   * @param opts.limit
   * @param opts.offset
   * @returns the post's comments as nested reply trees
   */
  async listCommentsThreaded(
    postId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<BlogCommentWithChildren[]> {
    return listCommentsThreadedDispatch(this.db, postId, opts,);
  }

  /**
   * Moderate a comment.
   * @param id
   * @param status
   * @param caller
   * @param caller.userId
   * @param caller.role
   * @returns true when the comment's status was changed
   */
  async moderateComment(
    id: string,
    status: BlogCommentStatus,
    caller: { userId: string; role: string | null },
  ): Promise<boolean> {
    return moderateCommentDispatch(this.db, id, status, caller,);
  }
}
