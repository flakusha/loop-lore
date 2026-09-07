// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Blog post data. */
export interface BlogPost {
  id: string;
  title: string;
  body: string;
  author_id: string;
  status: string;
  visibility: string;
  tags?: string[];
  category?: string | null;
  world_id?: string | null;
  character_id?: string | null;
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

/** RAG source linked to a blog post. */
export interface BlogSource {
  uri: string;
  title: string;
  snippet: string;
}

/** Blog page Alpine store state. */
export interface BlogState {
  _blogPosts: BlogPost[];
  _blogPost: BlogPost | null;
  _blogComments: BlogComment[];
  _blogSources: BlogSource[];
  _blogFilter: string;
  _blogTag: string | null;
  _blogFollowStatus: Record<string, boolean>;
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
  searchPosts(query: string,): Promise<void>;
  visiblePosts(): BlogPost[];
  followAuthor(authorId: string,): Promise<void>;
  unfollowAuthor(authorId: string,): Promise<void>;
  getFollowStatus(authorId: string,): Promise<boolean>;
  loadSources(postId: string,): Promise<void>;
}
