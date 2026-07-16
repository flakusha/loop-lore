/**
 * Tests for frontend/alpine/chat-utils.ts — chat utility functions
 */

import { describe, test, expect } from "bun:test";
import { chatUtils } from "./chat-utils";

describe("chatUtils", () => {
  describe("formatTime", () => {
    test("returns empty string for empty input", () => {
      expect((chatUtils as any).formatTime("")).toBe("");
    });

    test("returns empty string for undefined input", () => {
      expect((chatUtils as any).formatTime(undefined as any)).toBe("");
    });

    test("returns empty string for invalid date", () => {
      expect((chatUtils as any).formatTime("not-a-date")).toBe("");
    });

    test("formats valid ISO date string", () => {
      const iso = "2024-01-15T14:30:00.000Z";
      const result = (chatUtils as any).formatTime(iso);
      expect(typeof result).toBe("string");
    });

    test("formats valid ISO date with timezone", () => {
      const iso = "2024-06-20T10:45:30.000-05:00";
      const result = (chatUtils as any).formatTime(iso);
      expect(typeof result).toBe("string");
    });
  });

  describe("displayName", () => {
    test("returns 'You' for user role", () => {
      expect((chatUtils as any).displayName({ role: "user" })).toBe("You");
    });

    test("returns 'System' for system role", () => {
      expect((chatUtils as any).displayName({ role: "system" })).toBe("System");
    });

    test("returns 'Narrator' for narration role", () => {
      expect((chatUtils as any).displayName({ role: "narration" })).toBe("Narrator");
    });

    test("returns actor name for character role", () => {
      expect((chatUtils as any).displayName({ role: "char", actor_name: "Gandalf" })).toBe("Gandalf");
    });

    test("returns 'Assistant' for missing actor name", () => {
      expect((chatUtils as any).displayName({ role: "char", actor_name: undefined })).toBe("Assistant");
    });
  });

  describe("getMediaStyle", () => {
    test("returns empty style for non-image assets", () => {
      const result = (chatUtils as any).getMediaStyle({ type: "video" }, 1);
      expect(result).toEqual({});
    });

    test("returns empty style for image without dimensions", () => {
      const result = (chatUtils as any).getMediaStyle({ type: "image" }, 1);
      expect(result).toEqual({});
    });

    test("returns landscape style for single wide image", () => {
      const result = (chatUtils as any).getMediaStyle({ type: "image", width: 1920, height: 800 }, 1);
      expect(result.width).toBe("100%");
      expect(result.maxHeight).toBe("400px");
    });

    test("returns portrait style for single tall image", () => {
      const result = (chatUtils as any).getMediaStyle({ type: "image", width: 400, height: 1000 }, 1);
      expect(result.width).toBe("40%");
      expect(result.float).toBe("right");
      expect(result.marginLeft).toBe("12px");
    });

    test("returns square style for single square-ish image", () => {
      const result = (chatUtils as any).getMediaStyle({ type: "image", width: 800, height: 600 }, 1);
      expect(result.width).toBe("50%");
      expect(result.float).toBe("left");
      expect(result.marginRight).toBe("12px");
    });

    test("returns 50% width for two images", () => {
      const result = (chatUtils as any).getMediaStyle({ type: "image", width: 800, height: 600 }, 2);
      expect(result.width).toBe("calc(50% - 6px)");
    });
  });
});
