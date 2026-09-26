import "./i18n.test-helper";
import { afterEach, describe, expect, mock, test, } from "bun:test";
import { type BlogPost, blogStore, } from "./blog";

let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

mock.module("./htmx", () => ({
  apiFetch: async (url: string, opts?: RequestInit,) => {
    if (!fetchHandler) { return new Response("{}", { status: 200, },); }
    return fetchHandler(url, opts ?? {},);
  },
}),);

/**
 * @param status
 * @param body
 */
function mockFetch(status: number, body: unknown = {},) {
  fetchHandler = (_url, _opts,) => Response.json(body, { status, },);
}

/**
 * @param overrides
 */
function makePost(overrides: Partial<BlogPost> = {},): BlogPost {
  return {
    id: "p1",
    title: "Hello",
    body: "World body",
    author_id: "a1",
    status: "published",
    visibility: "public",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

const dispatched: { event: string; detail?: unknown }[] = [];
blogStore.$dispatch = (event, detail,) => {
  dispatched.push({ event, detail, },);
};

describe("blogStore — envelope parsing", () => {
  afterEach(() => {
    fetchHandler = null;
    dispatched.length = 0;
    blogStore._blogPosts = [];
    blogStore._blogPost = null;
    blogStore._blogComments = [];
    blogStore._blogSources = [];
    blogStore._blogFilter = "";
    blogStore._blogTag = null;
    blogStore._blogFollowStatus = {};
    blogStore._blogLoading = false;
    blogStore._blogError = "";
  },);

  test("loadPosts unwraps the { posts } envelope", async () => {
    mockFetch(200, { success: true, posts: [makePost(),], count: 1, },);
    await blogStore.loadPosts();
    expect(blogStore._blogPosts.length,).toBe(1,);
    expect(blogStore._blogPosts[0]!.id,).toBe("p1",);
  });

  test("loadPosts tolerates a bare array", async () => {
    mockFetch(200, [makePost({ id: "p2", },),],);
    await blogStore.loadPosts();
    expect(blogStore._blogPosts[0]!.id,).toBe("p2",);
  });

  test("loadPost unwraps the { post } envelope", async () => {
    mockFetch(200, { success: true, post: makePost(), },);
    await blogStore.loadPost("p1",);
    expect(blogStore._blogPost?.id,).toBe("p1",);
  });

  test("listComments unwraps the { comments } envelope", async () => {
    mockFetch(200, { success: true, comments: [], count: 0, },);
    await blogStore.listComments("p1",);
    expect(blogStore._blogComments,).toEqual([],);
    expect(blogStore._blogError,).toBe("",);
  });
});

describe("blogStore — follow and sources", () => {
  afterEach(() => {
    fetchHandler = null;
    dispatched.length = 0;
    blogStore._blogFollowStatus = {};
    blogStore._blogSources = [];
    blogStore._blogError = "";
  },);

  test("followAuthor marks followed and dispatches", async () => {
    mockFetch(200, { success: true, },);
    await blogStore.followAuthor("a1",);
    expect(blogStore._blogFollowStatus.a1,).toBe(true,);
    expect(dispatched.some((d,) => d.event === "blog-follow-changed"),).toBe(true,);
  });

  test("unfollowAuthor clears the flag", async () => {
    mockFetch(200, { success: true, },);
    await blogStore.followAuthor("a1",);
    await blogStore.unfollowAuthor("a1",);
    expect(blogStore._blogFollowStatus.a1,).toBe(false,);
  });

  test("getFollowStatus caches the server value", async () => {
    mockFetch(200, { success: true, following: true, },);
    const following = await blogStore.getFollowStatus("a1",);
    expect(following,).toBe(true,);
    expect(blogStore._blogFollowStatus.a1,).toBe(true,);
  });

  test("loadSources fills _blogSources", async () => {
    mockFetch(200, { success: true, sources: [{ uri: "u", title: "t", snippet: "s", },], count: 1, },);
    await blogStore.loadSources("p1",);
    expect(blogStore._blogSources.length,).toBe(1,);
    expect(blogStore._blogSources[0]!.title,).toBe("t",);
  });
});

describe("blogStore — visiblePosts", () => {
  afterEach(() => {
    blogStore._blogPosts = [];
    blogStore._blogFilter = "";
    blogStore._blogTag = null;
  },);

  test("filters by query across title and body", () => {
    blogStore._blogPosts = [
      makePost({ id: "p1", title: "Dragon lore", },),
      makePost({ id: "p2", title: "Tea", body: "quiet", },),
    ];
    blogStore._blogFilter = "dragon";
    expect(blogStore.visiblePosts().map((p,) => p.id),).toEqual(["p1",],);
  });

  test("filters by tag", () => {
    blogStore._blogPosts = [makePost({ id: "p1", tags: ["lore",], },), makePost({ id: "p2", },),];
    blogStore._blogTag = "lore";
    expect(blogStore.visiblePosts().map((p,) => p.id),).toEqual(["p1",],);
  });
});
