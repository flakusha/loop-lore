import { describe, expect, it, } from "bun:test";
import { BlogService, } from "./index";

describe("rpg/blog/service/index (0% -> real)", () => {
  it("BlogService prototype exists with createPost/getPost", () => {
    expect(typeof BlogService,).toBe("function",);
    expect(typeof BlogService.prototype.createPost,).toBe("function",);
    expect(typeof BlogService.prototype.getPost,).toBe("function",);
  });
});
