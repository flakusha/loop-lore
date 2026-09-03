// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { safeJsonStringify, } from "./json";

import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "blog", },);

/** Blog post data. */
export interface BlogPost {
  id: string;
  title: string;
  body: string;
  author_id: string;
  status: string;
  visibility: string;
  created_at: string;
  updated_at: string;
}

/** Blog comment data with nested children. */
export interface BlogComment {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  status: string;
  parent_comment_id: string | null;
  created_at: string;
  children?: BlogComment[];
}

/** Blog page Alpine store state. */
export interface BlogState {
  _blogPosts: BlogPost[];
  _blogPost: BlogPost | null;
  _blogComments: BlogComment[];
  _blogLoading: boolean;
  _blogError: string | null;

  $dispatch: (event: string, detail?: unknown,) => void;

  loadPosts(): Promise<void>;
  loadPost(id: string,): Promise<void>;
  createPost(
    input: {
      title: string;
      body: string;
      visibility?: string;
      category?: string;
      world_id?: string;
      character_id?: string;
      tags?: string[];
    },
  ): Promise<void>;
  createComment(postId: string, body: string, parent_comment_id?: string,): Promise<void>;
  listComments(postId: string,): Promise<void>;
}

const dispatch: BlogState["$dispatch"] = (event, detail,) => {
  document.dispatchEvent(new CustomEvent(event, { detail, },),);
};

export const blogStore: BlogState = {
  _blogPosts: [],
  _blogPost: null,
  _blogComments: [],
  _blogLoading: false,
  _blogError: "",

  $dispatch: dispatch,

  async loadPosts() {
    this._blogLoading = true;
    this._blogError = "";
    try {
      const res = await apiFetch("/api/blog/posts",);
      if (!res.ok) { throw new Error(t("errors.loadFailed",),); }
      const data = await res.json();
      this._blogPosts = (data as { posts: BlogPost[] }).posts ?? [];
      this.$dispatch("blog-posts-loaded", { posts: this._blogPosts, },);
    } catch (e) {
      this._blogError = (e as Error).message;
      log.error("loadPosts failed: " + this._blogError,);
    } finally {
      this._blogLoading = false;
    }
  },

  async loadPost(id: string,) {
    this._blogLoading = true;
    this._blogError = "";
    try {
      const res = await apiFetch(`/api/blog/posts/${id}`,);
      if (!res.ok) { throw new Error(t("errors.notFound",),); }
      this._blogPost = await res.json() as BlogPost | null;
    } catch (e) {
      this._blogError = (e as Error).message;
    } finally {
      this._blogLoading = false;
    }
  },

  async createPost(input,) {
    this._blogLoading = true;
    this._blogError = "";
    try {
      const res = await apiFetch("/api/blog/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: safeJsonStringify(input,).value,
      },);
      if (!res.ok) { throw new Error(t("errors.createFailed",),); }
      const post = await res.json() as BlogPost | null;
      if (post) { this._blogPosts.unshift(post,); }
      this.$dispatch("blog-post-created", { post, },);
    } catch (e) {
      this._blogError = (e as Error).message;
    } finally {
      this._blogLoading = false;
    }
  },

  async createComment(postId: string, body: string, parent_comment_id?: string,) {
    this._blogError = "";
    try {
      const res = await apiFetch(`/api/blog/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: safeJsonStringify({ body, parent_comment_id, },).value,
      },);
      if (!res.ok) { throw new Error(t("errors.createFailed",),); }
      const comment = await res.json();
      await this.listComments(postId,);
      this.$dispatch("blog-comment-created", { comment, },);
    } catch (e) {
      this._blogError = (e as Error).message;
    }
  },

  async listComments(postId: string,) {
    try {
      const res = await apiFetch(`/api/blog/posts/${postId}/comments`,);
      if (!res.ok) { throw new Error(t("errors.loadFailed",),); }
      this._blogComments = await res.json();
    } catch (e) {
      this._blogError = (e as Error).message;
    }
  },
};
