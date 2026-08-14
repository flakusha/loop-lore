// ── Types ────────────────────────────────────────────────
export const BlogPostVisibility = {
  Public: "public",
  Followers: "followers",
  Private: "private",
} as const;
export type BlogPostVisibility = (typeof BlogPostVisibility)[keyof typeof BlogPostVisibility];
export const BlogPostStatus = {
  Draft: "draft",
  Published: "published",
  Hidden: "hidden",
  Disabled: "disabled",
  Scheduled: "scheduled",
} as const;
export type BlogPostStatus = (typeof BlogPostStatus)[keyof typeof BlogPostStatus];
export const BlogAuthorType = {
  Human: "human",
  Llm: "llm",
} as const;
export type BlogAuthorType = (typeof BlogAuthorType)[keyof typeof BlogAuthorType];
export type BlogCommentStatus = "visible" | "hidden" | "deleted";
export type BlogRAGSourceType =
  | "internal_rag"
  | "external_web"
  | "external_api";

export interface BlogPostRow {
  id: string;
  author_id: string;
  title: string;
  body: string;
  visibility: BlogPostVisibility;
  author_type: BlogAuthorType;
  status: BlogPostStatus;
  category: string | null;
  world_id: string | null;
  character_id: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  view_count: number;
  metadata: string;
  created_at: string;
  updated_at: string;
}

export interface BlogCommentRow {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  status: BlogCommentStatus;
  created_at: string;
}

export interface BlogTagRow {
  id: string;
  post_id: string;
  tag: string;
}

export interface BlogFollowRow {
  id: string;
  follower_id: string;
  author_id: string;
  created_at: string;
}

export interface BlogRAGSourceRow {
  id: string;
  post_id: string;
  source_type: BlogRAGSourceType;
  uri: string;
  title: string;
  relevance_score: number;
  snippet: string;
  created_at: string;
}

export interface CreateBlogPostInput {
  author_id: string;
  title: string;
  body: string;
  visibility?: BlogPostVisibility;
  author_type?: BlogAuthorType;
  category?: string;
  world_id?: string;
  character_id?: string;
  tags?: string[];
  scheduled_at?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateBlogPostInput {
  title?: string;
  body?: string;
  visibility?: BlogPostVisibility;
  status?: BlogPostStatus;
  category?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface CreateCommentInput {
  post_id: string;
  author_id: string;
  body: string;
}

export interface BlogPostWithTags extends BlogPostRow {
  tags: string[];
}
