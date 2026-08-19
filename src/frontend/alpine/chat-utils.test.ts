/**
 * Tests for frontend/alpine/chat-utils.ts — chat utility functions
 */

import { afterEach, describe, expect, test, } from "bun:test";
import { chatUtils, } from "./chat-utils";
import type { ChatState, } from "./types";

describe("chatUtils", () => {
  describe("formatTime", () => {
    test("returns empty string for empty input", () => {
      expect((chatUtils as any).formatTime("",),).toBe("",);
    });

    test("returns empty string for undefined input", () => {
      expect((chatUtils as any).formatTime(undefined as any,),).toBe("",);
    });

    test("returns empty string for invalid date", () => {
      expect((chatUtils as any).formatTime("not-a-date",),).toBe("",);
    });

    test("formats valid ISO date string", () => {
      const iso = "2024-01-15T14:30:00.000Z";
      const result = (chatUtils as any).formatTime(iso,);
      expect(typeof result,).toBe("string",);
    });

    test("formats valid ISO date with timezone", () => {
      const iso = "2024-06-20T10:45:30.000-05:00";
      const result = (chatUtils as any).formatTime(iso,);
      expect(typeof result,).toBe("string",);
    });
  });

  describe("displayName", () => {
    test("returns 'You' for user role", () => {
      expect((chatUtils as any).displayName({ role: "user", },),).toBe("You",);
    });

    test("returns 'System' for system role", () => {
      expect((chatUtils as any).displayName({ role: "system", },),).toBe("System",);
    });

    test("returns 'Narrator' for narration role", () => {
      expect((chatUtils as any).displayName({ role: "narration", },),).toBe("Narrator",);
    });

    test("returns actor name for character role", () => {
      expect((chatUtils as any).displayName({ role: "char", actor_name: "Gandalf", },),).toBe("Gandalf",);
    });

    test("returns 'Assistant' for missing actor name", () => {
      expect((chatUtils as any).displayName({ role: "char", actor_name: undefined, },),).toBe("Assistant",);
    });
  });

  describe("getMediaStyle", () => {
    test("returns empty style for non-image assets", () => {
      const result = (chatUtils as any).getMediaStyle({ type: "video", }, 1,);
      expect(result,).toEqual({},);
    });

    test("returns empty style for image without dimensions", () => {
      const result = (chatUtils as any).getMediaStyle({ type: "image", }, 1,);
      expect(result,).toEqual({},);
    });

    test("returns landscape style for single wide image", () => {
      const result = (chatUtils as any).getMediaStyle({ type: "image", width: 1920, height: 800, }, 1,);
      expect(result.width,).toBe("100%",);
      expect(result.maxHeight,).toBe("400px",);
    });

    test("returns portrait style for single tall image", () => {
      const result = (chatUtils as any).getMediaStyle({ type: "image", width: 400, height: 1000, }, 1,);
      expect(result.width,).toBe("40%",);
      expect(result.float,).toBe("right",);
      expect(result.marginLeft,).toBe("12px",);
    });

    test("returns square style for single square-ish image", () => {
      const result = (chatUtils as any).getMediaStyle({ type: "image", width: 800, height: 600, }, 1,);
      expect(result.width,).toBe("50%",);
      expect(result.float,).toBe("left",);
      expect(result.marginRight,).toBe("12px",);
    });

    test("returns 50% width for two images", () => {
      const result = (chatUtils as any).getMediaStyle({ type: "image", width: 800, height: 600, }, 2,);
      expect(result.width,).toBe("calc(50% - 6px)",);
    });
  });

  describe("uploadChatAssets", () => {
    const originalApiFetch = globalThis.apiFetch;
    const fileInput = (name: string,) => {
      const evt = {
        target: { files: [new File(["x",], name,),], value: "C:\\fakepath", },
      };
      return evt as unknown as Event;
    };

    interface GalleryState {
      activeChat: string;
      galleryAssets: Array<{ id: string }>;
      loadGalleryAssets(): Promise<void>;
    }

    afterEach(() => {
      globalThis.apiFetch = originalApiFetch;
    },);

    test("uploads a file, links it to the active chat, and reloads gallery", async () => {
      const calls: Array<{ url: string; method?: string }> = [];
      globalThis.apiFetch = async (url: string, opts?: RequestInit,) => {
        calls.push({ url, method: opts?.method, },);
        if (url === "/api/assets" && opts?.method === "POST") {
          return Response.json({ id: "a1", }, { status: 201, },);
        }
        if (url === "/api/assets/a1/links" && opts?.method === "POST") {
          return Response.json({ id: "a1", }, { status: 201, },);
        }
        if (url.startsWith("/api/assets?entity_type=chat",)) {
          return Response.json({ data: [{ id: "a1", },], }, { status: 200, },);
        }
        return Response.json({ error: "not found", }, { status: 404, },);
      };

      const state: GalleryState = {
        activeChat: "chat-1",
        galleryAssets: [],
        loadGalleryAssets: async function(this: GalleryState,) {
          const res = await globalThis.apiFetch(
            `/api/assets?entity_type=chat&entity_id=${this.activeChat}&pageSize=200`,
          );
          const data = await res.json();
          this.galleryAssets = data.data || [];
        },
      };

      // state is a minimal stand-in for the full ChatState `this`; the cast is
      // unchecked + scoped to this test call.
      const self = state as unknown as ChatState;
      await chatUtils.uploadChatAssets!.call(self, fileInput("img.png",),);

      expect(calls.filter((c,) => c.method === "POST").length,).toBe(2,);
      expect(calls[0]?.url,).toBe("/api/assets",);
      expect(calls[1]?.url,).toBe("/api/assets/a1/links",);
      expect(state.galleryAssets,).toEqual([{ id: "a1", },],);
    });

    test("does not link when upload fails", async () => {
      const calls: Array<{ url: string; method?: string }> = [];
      globalThis.apiFetch = async (url: string, opts?: RequestInit,) => {
        calls.push({ url, method: opts?.method, },);
        return Response.json({ error: "nope", }, { status: 400, },);
      };

      const state: GalleryState = {
        activeChat: "chat-1",
        galleryAssets: [],
        loadGalleryAssets: async function(this: GalleryState,) {
          this.galleryAssets = [];
        },
      };
      const self = state as unknown as ChatState;
      await chatUtils.uploadChatAssets!.call(self, fileInput("img.png",),);

      const posts = calls.filter((c,) => c.method === "POST");
      expect(posts.length,).toBe(1,);
      expect(posts[0]?.url,).toBe("/api/assets",);
    });
  });
});
