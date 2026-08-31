// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Blog Service — Post, comment, follow, and RAG source management.
 *
 * Supports both human-authored and LLM-authored posts with
 * visibility tiers (public/followers/private), moderation status,
 * tag management, and RAG source tracking.
 *
 * The concrete logic lives in isolated dispatcher modules (posts,
 * comments, follows, rag, tags) threaded with an explicit `db`
 * handle. `BlogService` remains a class so its methods stay on the
 * prototype.
 */
import type { Kysely, } from "kysely";
import {
  createComment as createCommentDispatch,
  listComments as listCommentsDispatch,
  moderateComment as moderateCommentDispatch,
} from "./comments";
import {
  follow as followDispatch,
  getFollowers as getFollowersDispatch,
  getFollowStatus as getFollowStatusDispatch,
  isFollowing as isFollowingDispatch,
  unfollow as unfollowDispatch,
} from "./follows";
import {
  createPost as createPostDispatch,
  deletePost as deletePostDispatch,
  getPost as getPostDispatch,
  incrementViewCount as incrementViewCountDispatch,
  listPosts as listPostsDispatch,
  updatePost as updatePostDispatch,
} from "./posts";
import { addRAGSource as addRAGSourceDispatch, getRAGSources as getRAGSourcesDispatch, } from "./rag";
import type {
  BlogCommentRow,
  BlogCommentStatus,
  BlogFollowRow,
  BlogPostRow,
  BlogPostStatus,
  BlogPostVisibility,
  BlogPostWithTags,
  BlogRAGSourceRow,
  CreateBlogPostInput,
  CreateCommentInput,
  UpdateBlogPostInput,
} from "./types";

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
} from "./types";

// ── Service ──────────────────────────────────────────────
/** */
export class BlogService {
  /**
   * @param db
   */
  constructor(private readonly db: Kysely<any>,) {}

  // ── Posts ────────────────────────────────────────────
  /**
   * @param input
   */
  async createPost(input: CreateBlogPostInput,): Promise<BlogPostRow> {
    return createPostDispatch(this.db, input,);
  }

  /**
   * @param id
   */
  async getPost(id: string,): Promise<BlogPostWithTags | undefined> {
    return getPostDispatch(this.db, id,);
  }

  /**
   * @param filters
   * @param filters.author_id
   * @param filters.visibility
   * @param filters.status
   * @param filters.category
   * @param filters.world_id
   * @param filters.limit
   * @param filters.offset
   */
  async listPosts(filters: {
    author_id?: string;
    visibility?: BlogPostVisibility;
    status?: BlogPostStatus;
    category?: string;
    world_id?: string;
    limit?: number;
    offset?: number;
  },): Promise<BlogPostWithTags[]> {
    return listPostsDispatch(this.db, filters,);
  }

  /**
   * @param id
   * @param input
   */
  async updatePost(
    id: string,
    input: UpdateBlogPostInput,
  ): Promise<BlogPostRow | undefined> {
    return updatePostDispatch(this.db, id, input,);
  }

  /**
   * @param id
   */
  async deletePost(id: string,): Promise<boolean> {
    return deletePostDispatch(this.db, id,);
  }

  /**
   * @param id
   */
  async incrementViewCount(id: string,): Promise<void> {
    return incrementViewCountDispatch(this.db, id,);
  }

  // ── Comments ─────────────────────────────────────────
  /**
   * @param input
   */
  async createComment(input: CreateCommentInput,): Promise<BlogCommentRow> {
    return createCommentDispatch(this.db, input,);
  }

  /**
   * @param postId
   * @param opts
   * @param opts.limit
   * @param opts.offset
   */
  async listComments(
    postId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<BlogCommentRow[]> {
    return listCommentsDispatch(this.db, postId, opts,);
  }

  /**
   * @param id
   * @param status
   */
  async moderateComment(
    id: string,
    status: BlogCommentStatus,
  ): Promise<boolean> {
    return moderateCommentDispatch(this.db, id, status,);
  }

  // ── Follows ──────────────────────────────────────────
  /**
   * @param followerId
   * @param authorId
   */
  async follow(
    followerId: string,
    authorId: string,
  ): Promise<BlogFollowRow> {
    return followDispatch(this.db, followerId, authorId,);
  }

  /**
   * @param followerId
   * @param authorId
   */
  async unfollow(
    followerId: string,
    authorId: string,
  ): Promise<boolean> {
    return unfollowDispatch(this.db, followerId, authorId,);
  }

  /**
   * @param authorId
   */
  async getFollowers(authorId: string,): Promise<string[]> {
    return getFollowersDispatch(this.db, authorId,);
  }

  /**
   * @param followerId
   * @param authorId
   */
  async isFollowing(
    followerId: string,
    authorId: string,
  ): Promise<boolean> {
    return isFollowingDispatch(this.db, followerId, authorId,);
  }

  /**
   * @param followerId
   * @param authorId
   */
  async getFollowStatus(
    followerId: string,
    authorId: string,
  ): Promise<{ following: boolean }> {
    return getFollowStatusDispatch(this.db, followerId, authorId,);
  }

  // ── RAG Sources ──────────────────────────────────────
  /**
   * @param postId
   * @param source
   */
  async addRAGSource(
    postId: string,
    source: Omit<BlogRAGSourceRow, "id" | "created_at" | "post_id">,
  ): Promise<BlogRAGSourceRow> {
    return addRAGSourceDispatch(this.db, postId, source,);
  }

  /**
   * @param postId
   */
  async getRAGSources(postId: string,): Promise<BlogRAGSourceRow[]> {
    return getRAGSourcesDispatch(this.db, postId,);
  }
}
