import "./i18n.test-helper";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { type BlogPost, blogStore, } from "./blog";

let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;
let originalFetch: typeof fetch;

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

beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = ((url: string | URL | Request, opts?: RequestInit,) => {
    if (!fetchHandler) { return Promise.resolve(new Response("{}", { status: 200, },),); }
    return Promise.resolve(fetchHandler(url as string, opts ?? {},),);
  }) as typeof fetch;
},);

afterEach(() => {
  globalThis.fetch = originalFetch;
},);

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

describe("blogStore — error paths", () => {
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

  test("loadPosts sets _blogError on a non-ok response", async () => {
    mockFetch(500, { error: "down", },);
    await blogStore.loadPosts();
    expect(blogStore._blogError,).not.toBe("",);
    expect(blogStore._blogPosts,).toEqual([],);
    expect(blogStore._blogLoading,).toBe(false,);
  });

  test("loadPosts tolerates an envelope without a posts key", async () => {
    mockFetch(200, { success: true, count: 0, },);
    await blogStore.loadPosts();
    expect(blogStore._blogPosts,).toEqual([],);
    expect(blogStore._blogError,).toBe("",);
  });

  test("loadPost sets _blogError on a non-ok response", async () => {
    mockFetch(404, { error: "missing", },);
    await blogStore.loadPost("p1",);
    expect(blogStore._blogError,).not.toBe("",);
    expect(blogStore._blogPost,).toBeNull();
  });

  test("loadPost tolerates a bare post object", async () => {
    mockFetch(200, makePost({ id: "p9", },),);
    await blogStore.loadPost("p9",);
    expect(blogStore._blogPost?.id,).toBe("p9",);
  });

  test("listComments tolerates a bare array", async () => {
    mockFetch(200, [{ id: "c1", body: "hi", },],);
    await blogStore.listComments("p1",);
    expect(blogStore._blogComments,).toHaveLength(1,);
    expect(blogStore._blogComments[0]?.id,).toBe("c1",);
  });

  test("listComments sets _blogError on a non-ok response", async () => {
    mockFetch(500, {},);
    await blogStore.listComments("p1",);
    expect(blogStore._blogError,).not.toBe("",);
    expect(blogStore._blogComments,).toEqual([],);
  });

  test("followAuthor sets _blogError and does not dispatch on failure", async () => {
    mockFetch(500, {},);
    await blogStore.followAuthor("a1",);
    expect(blogStore._blogError,).not.toBe("",);
    expect(blogStore._blogFollowStatus.a1,).toBeUndefined();
    expect(dispatched.some((d,) => d.event === "blog-follow-changed"),).toBe(false,);
  });

  test("unfollowAuthor sets _blogError on failure", async () => {
    mockFetch(500, {},);
    await blogStore.unfollowAuthor("a1",);
    expect(blogStore._blogError,).not.toBe("",);
    expect(blogStore._blogFollowStatus.a1,).toBeUndefined();
  });

  test("getFollowStatus returns the cached value on a non-ok response", async () => {
    blogStore._blogFollowStatus.a1 = true;
    mockFetch(500, {},);
    expect(await blogStore.getFollowStatus("a1",),).toBe(true,);
  });

  test("getFollowStatus returns the cached value on a network error", async () => {
    blogStore._blogFollowStatus.a1 = true;
    fetchHandler = () => {
      throw new Error("offline",);
    };

    expect(await blogStore.getFollowStatus("a1",),).toBe(true,);
  });

  test("getFollowStatus defaults to false when nothing is cached", async () => {
    mockFetch(500, {},);
    expect(await blogStore.getFollowStatus("ghost",),).toBe(false,);
  });

  test("loadSources sets _blogError on a non-ok response", async () => {
    mockFetch(500, {},);
    await blogStore.loadSources("p1",);
    expect(blogStore._blogError,).not.toBe("",);
    expect(blogStore._blogSources,).toEqual([],);
  });
});

describe("blogStore — searchPosts", () => {
  afterEach(() => {
    fetchHandler = null;
    dispatched.length = 0;
    blogStore._blogPosts = [];
    blogStore._blogFilter = "";
    blogStore._blogTag = null;
    blogStore._blogError = "";
  },);

  test("loads posts when the list is empty, then dispatches the filtered set", async () => {
    mockFetch(200, { posts: [makePost({ id: "p1", title: "Dragon", },), makePost({ id: "p2", },),], },);
    await blogStore.searchPosts("dragon",);
    expect(blogStore._blogFilter,).toBe("dragon",);
    expect(blogStore._blogPosts,).toHaveLength(2,);
    // loadPosts dispatches the full list first; searchPosts then dispatches the filtered set
    const loadEvents = dispatched.filter((d,) => d.event === "blog-posts-loaded");
    const detail = loadEvents.at(-1,)?.detail as { posts: BlogPost[] };
    expect(detail.posts.map((p,) => p.id),).toEqual(["p1",],);
  });

  test("does not refetch when posts are already loaded", async () => {
    blogStore._blogPosts = [makePost({ id: "p1", title: "Dragon", },),];
    await blogStore.searchPosts("dragon",);
    expect(fetchHandler,).toBeNull();
    const loadEvent = dispatched.find((d,) => d.event === "blog-posts-loaded");
    // detail is built by blogStore itself: { posts: BlogPost[] }
    const detail = loadEvent?.detail as { posts: BlogPost[] };
    expect(detail.posts,).toHaveLength(1,);
  });
});

describe("blogStore — createPost / createComment", () => {
  afterEach(() => {
    fetchHandler = null;
    dispatched.length = 0;
    blogStore._blogPosts = [];
    blogStore._blogComments = [];
    blogStore._blogError = "";
  },);

  test("createPost POSTs the draft and unshifts the created post", async () => {
    let call = 0;
    fetchHandler = (_url, _opts,) => {
      call++;
      if (call === 1) { return Response.json({ post: makePost({ id: "p-new", },), }, { status: 201, },); }
      return new Response("{}", { status: 200, },);
    };

    await blogStore.createPost({ title: "New", body: "Body", },);
    expect(blogStore._blogPosts[0]?.id,).toBe("p-new",);
    expect(dispatched.some((d,) => d.event === "blog-post-created"),).toBe(true,);
  });

  test("createPost ignores a null response body", async () => {
    mockFetch(200, null,);
    await blogStore.createPost({ title: "New", body: "Body", },);
    expect(blogStore._blogPosts,).toEqual([],);
    expect(dispatched.some((d,) => d.event === "blog-post-created"),).toBe(true,);
  });

  test("createPost sets _blogError on a non-ok response", async () => {
    mockFetch(422, { error: "invalid", },);
    await blogStore.createPost({ title: "New", body: "Body", },);
    expect(blogStore._blogError,).not.toBe("",);
    expect(blogStore._blogPosts,).toEqual([],);
  });

  test("createComment POSTs the body and reloads the comment list", async () => {
    let call = 0;
    fetchHandler = (_url, _opts,) => {
      call++;
      if (call === 1) {
        return Response.json({ id: "c-new", body: "nice", }, { status: 201, },);
      }

      return Response.json({ comments: [{ id: "c-new", body: "nice", },], }, { status: 200, },);
    };

    await blogStore.createComment("p1", "nice",);
    expect(blogStore._blogComments,).toHaveLength(1,);
    expect(blogStore._blogComments[0]?.id,).toBe("c-new",);
    expect(dispatched.some((d,) => d.event === "blog-comment-created"),).toBe(true,);
  });

  test("createComment sets _blogError on a non-ok response", async () => {
    mockFetch(500, {},);
    await blogStore.createComment("p1", "nice",);
    expect(blogStore._blogError,).not.toBe("",);
    expect(dispatched.some((d,) => d.event === "blog-comment-created"),).toBe(false,);
  });
});

describe("blogStore — visiblePosts boundaries", () => {
  afterEach(() => {
    blogStore._blogPosts = [];
    blogStore._blogFilter = "";
    blogStore._blogTag = null;
  },);

  test("returns every post for an empty or whitespace-only query", () => {
    blogStore._blogPosts = [makePost({ id: "p1", },), makePost({ id: "p2", },),];
    blogStore._blogFilter = "   ";
    expect(blogStore.visiblePosts(),).toHaveLength(2,);
  });

  test("matches case-insensitively against the body", () => {
    blogStore._blogPosts = [makePost({ id: "p1", title: "Tea", body: "Quiet DRAGON lore", },),];
    blogStore._blogFilter = "dragon";
    expect(blogStore.visiblePosts().map((p,) => p.id),).toEqual(["p1",],);
  });

  test("excludes posts without a tags field when a tag filter is active", () => {
    blogStore._blogPosts = [makePost({ id: "p1", },), makePost({ id: "p2", tags: ["lore",], },),];
    blogStore._blogTag = "lore";
    expect(blogStore.visiblePosts().map((p,) => p.id),).toEqual(["p2",],);
  });
});
