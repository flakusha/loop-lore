// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Blog service: posts, comments, follows, RAG sources. */
import type { Kysely, } from "kysely";
import {
  createComment as createCommentDispatch,
  getComment as getCommentDispatch,
  listComments as listCommentsDispatch,
  listCommentsThreaded as listCommentsThreadedDispatch,
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
  BlogCommentWithChildren,
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
export class BlogService {
  /** */
  constructor(private readonly db: Kysely<any>,) {}

  // ── Posts ────────────────────────────────────
  /** Create a post. */
  async createPost(input: CreateBlogPostInput,): Promise<BlogPostRow> {
    return createPostDispatch(this.db, input,);
  }

  /** Get a post by ID. */
  async getPost(id: string,): Promise<BlogPostWithTags | undefined> {
    return getPostDispatch(this.db, id,);
  }

  /** List posts with optional filters. */
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

  /** Update a post. */
  async updatePost(
    id: string,
    input: UpdateBlogPostInput,
  ): Promise<BlogPostRow | undefined> {
    return updatePostDispatch(this.db, id, input,);
  }

  /** Delete a post. */
  async deletePost(id: string,): Promise<boolean> {
    return deletePostDispatch(this.db, id,);
  }

  /** Increment a post's view count. */
  async incrementViewCount(id: string,): Promise<void> {
    return incrementViewCountDispatch(this.db, id,);
  }

  // ── Comments ─────────────────────────────────
  /** Create a comment. */
  async createComment(input: CreateCommentInput,): Promise<BlogCommentRow> {
    return createCommentDispatch(this.db, input,);
  }

  /** Get a comment. */
  async getComment(id: string,): Promise<BlogCommentRow | undefined> {
    return getCommentDispatch(this.db, id,);
  }

  /** List comments for a post. */
  async listComments(
    postId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<BlogCommentRow[]> {
    return listCommentsDispatch(this.db, postId, opts,);
  }

  /** List threaded comments for a post. */
  async listCommentsThreaded(
    postId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<BlogCommentWithChildren[]> {
    return listCommentsThreadedDispatch(this.db, postId, opts,);
  }

  /** Moderate a comment. */
  async moderateComment(
    id: string,
    status: BlogCommentStatus,
  ): Promise<boolean> {
    return moderateCommentDispatch(this.db, id, status,);
  }

  // ── Follows ──────────────────────────────────
  /** Follow an author. */
  async follow(
    followerId: string,
    authorId: string,
  ): Promise<BlogFollowRow> {
    return followDispatch(this.db, followerId, authorId,);
  }

  /** Unfollow an author. */
  async unfollow(
    followerId: string,
    authorId: string,
  ): Promise<boolean> {
    return unfollowDispatch(this.db, followerId, authorId,);
  }

  /** Get followers for an author. */
  async getFollowers(authorId: string,): Promise<string[]> {
    return getFollowersDispatch(this.db, authorId,);
  }

  /** Check if a user follows an author. */
  async isFollowing(
    followerId: string,
    authorId: string,
  ): Promise<boolean> {
    return isFollowingDispatch(this.db, followerId, authorId,);
  }

  /** Get follow status for a user. */
  async getFollowStatus(
    followerId: string,
    authorId: string,
  ): Promise<{ following: boolean }> {
    return getFollowStatusDispatch(this.db, followerId, authorId,);
  }

  // ── RAG Sources ──────────────────────────────
  /** Add a RAG source to a post. */
  async addRAGSource(
    postId: string,
    source: Omit<BlogRAGSourceRow, "id" | "created_at" | "post_id">,
  ): Promise<BlogRAGSourceRow> {
    return addRAGSourceDispatch(this.db, postId, source,);
  }

  /** Get RAG sources for a post. */
  async getRAGSources(postId: string,): Promise<BlogRAGSourceRow[]> {
    return getRAGSourcesDispatch(this.db, postId,);
  }
}
