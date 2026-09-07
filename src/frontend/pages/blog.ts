// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type BlogComment, type BlogPost, type BlogState, blogStore, } from "../alpine/blog";
import { chatUtilsRender, } from "../alpine/chat-utils/render";
import { log, } from "../alpine/logger";

const blogLog = log.child({ module: "blog-page", },);

document.addEventListener("htmx:load", () => {
  blogLog.info("Blog page loaded",);
},);

declare global {
  var blogPage: () => BlogPageState;
}

export function initBlogPage() {
  blogLog.info("initBlogPage",);
  void blogStore.loadPosts();
}

/** Flattened comment with reply depth for template rendering. */
interface FlatComment {
  comment: BlogComment;
  depth: number;
}

/** Alpine component state for the blog view (blog.html). */
interface BlogPageState {
  store: BlogState;
  selectedPostId: string | null;
  replyTo: string | null;
  commentBody: string;
  showCreate: boolean;
  formTitle: string;
  formBody: string;
  formVisibility: string;
  formTags: string;
  formWorldId: string;
  formCharacterId: string;
  formError: string;
  following: boolean;
  readonly posts: BlogPost[];
  readonly selected: BlogPost | null;
  init(): void;
  selectPost(id: string,): Promise<void>;
  backToList(): void;
  setTag(tag: string | null,): void;
  excerpt(body: string,): string;
  renderBody(body: string,): string;
  flatComments(): FlatComment[];
  commentCount(): number;
  startReply(commentId: string | null,): void;
  submitComment(): Promise<void>;
  toggleFollow(): Promise<void>;
  toggleCreate(): void;
  submitPost(): Promise<void>;
}

globalThis.blogPage = function(): BlogPageState {
  return {
    store: blogStore,
    selectedPostId: null as string | null,
    replyTo: null as string | null,
    commentBody: "",
    showCreate: false,
    formTitle: "",
    formBody: "",
    formVisibility: "public",
    formTags: "",
    formWorldId: "",
    formCharacterId: "",
    formError: "",
    following: false,

    get posts() {
      return this.store.visiblePosts();
    },

    get selected() {
      if (this.selectedPostId === null) { return null; }
      return this.store._blogPosts.find((p,) => p.id === this.selectedPostId) ?? this.store._blogPost;
    },

    init() {
      initBlogPage();
    },

    async selectPost(id: string,) {
      this.selectedPostId = id;
      this.replyTo = null;
      this.showCreate = false;
      await this.store.loadPost(id,);
      const post = this.store._blogPost;
      const authorId = post !== null && post.id === id
        ? post.author_id
        : this.store._blogPosts.find((p,) => p.id === id)?.author_id;
      await this.store.listComments(id,);
      await this.store.loadSources(id,);
      this.following = authorId === undefined ? false : await this.store.getFollowStatus(authorId,);
    },

    backToList() {
      this.selectedPostId = null;
      this.replyTo = null;
    },

    setTag(tag: string | null,) {
      this.store._blogTag = tag;
    },

    excerpt(body: string,): string {
      return body.length > 200 ? body.slice(0, 200,) + "…" : body;
    },

    renderBody(body: string,): string {
      return chatUtilsRender.renderMarkdown?.(body,) ?? body;
    },

    flatComments(): FlatComment[] {
      const out: FlatComment[] = [];
      const walk = (list: BlogComment[], depth: number,): void => {
        for (const c of list) {
          out.push({ comment: c, depth, },);
          if (c.children !== undefined && c.children.length > 0) { walk(c.children, depth + 1,); }
        }
      };
      walk(this.store._blogComments, 0,);
      return out;
    },

    commentCount(): number {
      return this.flatComments().length;
    },

    startReply(commentId: string | null,) {
      this.replyTo = commentId;
    },

    async submitComment() {
      if (this.selectedPostId === null || this.commentBody.trim() === "") { return; }
      await this.store.createComment(this.selectedPostId, this.commentBody.trim(), this.replyTo ?? undefined,);
      this.commentBody = "";
      this.replyTo = null;
    },

    async toggleFollow() {
      const post = this.selected;
      if (post === null || post === undefined) { return; }
      if (this.following) {
        await this.store.unfollowAuthor(post.author_id,);
      } else {
        await this.store.followAuthor(post.author_id,);
      }
      this.following = await this.store.getFollowStatus(post.author_id,);
    },

    toggleCreate() {
      this.showCreate = !this.showCreate;
      this.formError = "";
    },

    async submitPost() {
      this.formError = "";
      if (this.formTitle.trim() === "" || this.formBody.trim() === "") {
        this.formError = "create";
        return;
      }
      const tags = this.formTags.split(",",).map((s,) => s.trim()).filter((s,) => s !== "");
      await this.store.createPost({
        title: this.formTitle.trim(),
        body: this.formBody.trim(),
        visibility: this.formVisibility,
        world_id: this.formWorldId.trim() === "" ? undefined : this.formWorldId.trim(),
        character_id: this.formCharacterId.trim() === "" ? undefined : this.formCharacterId.trim(),
        tags,
      },);
      if (this.store._blogError !== "" && this.store._blogError !== null) { return; }
      this.formTitle = "";
      this.formBody = "";
      this.formTags = "";
      this.formWorldId = "";
      this.formCharacterId = "";
      this.formVisibility = "public";
      this.showCreate = false;
      await this.store.loadPosts();
    },
  };
};
