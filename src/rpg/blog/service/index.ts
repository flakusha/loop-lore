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
export class BlogService {
  constructor(private readonly db: Kysely<any>,) {}

  // ── Posts ────────────────────────────────────────────
  async createPost(input: CreateBlogPostInput,): Promise<BlogPostRow> {
    return createPostDispatch(this.db, input,);
  }

  async getPost(id: string,): Promise<BlogPostWithTags | undefined> {
    return getPostDispatch(this.db, id,);
  }

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

  async updatePost(
    id: string,
    input: UpdateBlogPostInput,
  ): Promise<BlogPostRow | undefined> {
    return updatePostDispatch(this.db, id, input,);
  }

  async deletePost(id: string,): Promise<boolean> {
    return deletePostDispatch(this.db, id,);
  }

  async incrementViewCount(id: string,): Promise<void> {
    return incrementViewCountDispatch(this.db, id,);
  }

  // ── Comments ─────────────────────────────────────────
  async createComment(input: CreateCommentInput,): Promise<BlogCommentRow> {
    return createCommentDispatch(this.db, input,);
  }

  async listComments(
    postId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<BlogCommentRow[]> {
    return listCommentsDispatch(this.db, postId, opts,);
  }

  async moderateComment(
    id: string,
    status: BlogCommentStatus,
  ): Promise<boolean> {
    return moderateCommentDispatch(this.db, id, status,);
  }

  // ── Follows ──────────────────────────────────────────
  async follow(
    followerId: string,
    authorId: string,
  ): Promise<BlogFollowRow> {
    return followDispatch(this.db, followerId, authorId,);
  }

  async unfollow(
    followerId: string,
    authorId: string,
  ): Promise<boolean> {
    return unfollowDispatch(this.db, followerId, authorId,);
  }

  async getFollowers(authorId: string,): Promise<string[]> {
    return getFollowersDispatch(this.db, authorId,);
  }

  async isFollowing(
    followerId: string,
    authorId: string,
  ): Promise<boolean> {
    return isFollowingDispatch(this.db, followerId, authorId,);
  }

  async getFollowStatus(
    followerId: string,
    authorId: string,
  ): Promise<{ following: boolean }> {
    return getFollowStatusDispatch(this.db, followerId, authorId,);
  }

  // ── RAG Sources ──────────────────────────────────────
  async addRAGSource(
    postId: string,
    source: Omit<BlogRAGSourceRow, "id" | "created_at" | "post_id">,
  ): Promise<BlogRAGSourceRow> {
    return addRAGSourceDispatch(this.db, postId, source,);
  }

  async getRAGSources(postId: string,): Promise<BlogRAGSourceRow[]> {
    return getRAGSourcesDispatch(this.db, postId,);
  }
}
