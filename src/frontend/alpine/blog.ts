// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type BlogComment, type BlogPost, type BlogSource, type BlogState, } from "./blog-types";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";

import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "blog", },);

export type { BlogComment, BlogPost, BlogSource, BlogState, } from "./blog-types";

const dispatch: BlogState["$dispatch"] = (event, detail,) => {
  document.dispatchEvent(new CustomEvent(event, { detail, },),);
};

export const blogStore: BlogState = {
  _blogPosts: [],
  _blogPost: null,
  _blogComments: [],
  _blogSources: [],
  _blogFilter: "",
  _blogTag: null,
  _blogFollowStatus: {},
  _blogLoading: false,
  _blogError: "",

  $dispatch: dispatch,

  async loadPosts() {
    this._blogLoading = true;
    this._blogError = "";
    try {
      const res = await apiFetch("/api/blog/posts",);
      if (!res.ok) { throw new Error(t("errors.loadFailed",),); }
      const data: unknown = await res.json();
      this._blogPosts = Array.isArray(data,) ? (data as BlogPost[]) : ((data as { posts?: BlogPost[] }).posts ?? []);
      this.$dispatch("blog-posts-loaded", { posts: this._blogPosts, },);
    } catch (e) {
      this._blogError = (e as Error).message;
      log.error("loadPosts failed: " + this._blogError,);
    } finally {
      this._blogLoading = false;
    }
  },

  async searchPosts(query: string,) {
    this._blogFilter = query;
    if (this._blogPosts.length === 0) {
      await this.loadPosts();
    }
    this.$dispatch("blog-posts-loaded", { posts: this.visiblePosts(), },);
  },

  visiblePosts() {
    const q = this._blogFilter.trim().toLowerCase();
    return this._blogPosts.filter((p,) => {
      if (this._blogTag !== null && !(p.tags ?? []).includes(this._blogTag,)) { return false; }
      if (q === "") { return true; }
      return p.title.toLowerCase().includes(q,) || p.body.toLowerCase().includes(q,);
    },);
  },

  async loadPost(id: string,) {
    this._blogLoading = true;
    this._blogError = "";
    try {
      const res = await apiFetch(`/api/blog/posts/${id}`,);
      if (!res.ok) { throw new Error(t("errors.notFound",),); }
      const data: unknown = await res.json();
      this._blogPost = Array.isArray(data,) ? null : ((data as { post?: BlogPost }).post ?? (data as BlogPost));
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
        body: jsonBody(input,),
      },);
      if (!res.ok) { throw new Error(t("errors.createFailed",),); }
      const data: unknown = await res.json();
      const post = data === null || data === undefined
        ? null
        : ((data as { post?: BlogPost }).post ?? (data as BlogPost));
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
        body: jsonBody({ body, parent_comment_id, },),
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
      const data: unknown = await res.json();
      this._blogComments = Array.isArray(data,)
        ? (data as BlogComment[])
        : ((data as { comments?: BlogComment[] }).comments ?? []);
    } catch (e) {
      this._blogError = (e as Error).message;
    }
  },

  async followAuthor(authorId: string,) {
    this._blogError = "";
    try {
      const res = await apiFetch(`/api/blog/follow/${authorId}`, { method: "POST", },);
      if (!res.ok) { throw new Error(t("errors.createFailed",),); }
      this._blogFollowStatus[authorId] = true;
      this.$dispatch("blog-follow-changed", { authorId, following: true, },);
    } catch (e) {
      this._blogError = (e as Error).message;
    }
  },

  async unfollowAuthor(authorId: string,) {
    this._blogError = "";
    try {
      const res = await apiFetch(`/api/blog/follow/${authorId}`, { method: "DELETE", },);
      if (!res.ok) { throw new Error(t("errors.createFailed",),); }
      this._blogFollowStatus[authorId] = false;
      this.$dispatch("blog-follow-changed", { authorId, following: false, },);
    } catch (e) {
      this._blogError = (e as Error).message;
    }
  },

  async getFollowStatus(authorId: string,) {
    try {
      const res = await apiFetch(`/api/blog/follow/${authorId}/status`,);
      if (!res.ok) { return this._blogFollowStatus[authorId] ?? false; }
      const data = await res.json() as { following?: boolean };
      const following = data.following ?? false;
      this._blogFollowStatus[authorId] = following;
      return following;
    } catch {
      return this._blogFollowStatus[authorId] ?? false;
    }
  },

  async loadSources(postId: string,) {
    try {
      const res = await apiFetch(`/api/blog/posts/${postId}/sources`,);
      if (!res.ok) { throw new Error(t("errors.loadFailed",),); }
      const data = await res.json() as { sources?: BlogSource[] };
      this._blogSources = data.sources ?? [];
    } catch (e) {
      this._blogError = (e as Error).message;
    }
  },
};
