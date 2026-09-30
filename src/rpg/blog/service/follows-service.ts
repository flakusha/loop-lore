// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Blog follows + RAG-source methods (split from index.ts per 250L size guard). */
import type { Kysely, } from "kysely";
import {
  follow as followDispatch,
  getFollowers as getFollowersDispatch,
  getFollowStatus as getFollowStatusDispatch,
  isFollowing as isFollowingDispatch,
  unfollow as unfollowDispatch,
} from "./follows";
import { addRAGSource as addRAGSourceDispatch, getRAGSources as getRAGSourcesDispatch, } from "./rag";
import type { BlogFollowRow, BlogRAGSourceRow, } from "./types";

/** Base class carrying the follows and RAG-source sections of BlogService. */
export class BlogFollowsService {
  /**
   * @param db
   */
  constructor(protected readonly db: Kysely<any>,) {}

  // ── Follows ──────────────────────────────────
  /**
   * Follow an author.
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
   * Unfollow an author.
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
   * Get followers for an author.
   * @param authorId
   */
  async getFollowers(authorId: string,): Promise<string[]> {
    return getFollowersDispatch(this.db, authorId,);
  }

  /**
   * Check if a user follows an author.
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
   * Get follow status for a user.
   * @param followerId
   * @param authorId
   */
  async getFollowStatus(
    followerId: string,
    authorId: string,
  ): Promise<{ following: boolean }> {
    return getFollowStatusDispatch(this.db, followerId, authorId,);
  }

  // ── RAG Sources ──────────────────────────────
  /**
   * Add a RAG source to a post.
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
   * Get RAG sources for a post.
   * @param postId
   */
  async getRAGSources(postId: string,): Promise<BlogRAGSourceRow[]> {
    return getRAGSourcesDispatch(this.db, postId,);
  }
}
