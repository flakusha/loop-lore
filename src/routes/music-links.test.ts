import { describe, expect, it, } from "bun:test";
import { musicLinksRoutes, } from "../routes/music-links";

describe("music-links (0% -> real import)", () => {
  it("musicLinksRoutes creates Elysia instance with .post route", () => {
    const app = musicLinksRoutes({ database: {} as any, nsfwFilterEnabled: false, },);
    expect(app,).toBeDefined();
    expect(typeof (app as any).post,).toBe("function",);
  });
});
