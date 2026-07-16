import { describe, test, expect } from "bun:test";
import { chatMessages } from "./chat-messages";

globalThis.document = {
  createElement: (tag: string) => {
    const el: any = { style: {}, value: "", tagName: tag.toUpperCase() };
    Object.defineProperty(el, "scrollHeight", { value: 20, writable: true, configurable: true });
    if (tag === "textarea") el.scrollHeight = 20;
    return el;
  },
  querySelector: null,
} as any;

describe("chatMessages", () => {
  describe("autoResize", () => {
    test("resizes textarea based on content", () => {
      const textarea = document.createElement("textarea");
      textarea.style.height = "auto";
      Object.defineProperty(textarea, "scrollHeight", { value: 60, writable: true, configurable: true });

      chatMessages.autoResize!.call({}, textarea);

      expect(textarea.style.height).toBe("60px");
    });

    test("caps height at 200px", () => {
      const textarea = document.createElement("textarea");
      textarea.style.height = "auto";
      Object.defineProperty(textarea, "scrollHeight", { value: 500, writable: true, configurable: true });

      chatMessages.autoResize!.call({}, textarea);

      expect(textarea.style.height).toBe("200px");
    });

    test("handles empty textarea", () => {
      const textarea = document.createElement("textarea");
      textarea.style.height = "auto";
      Object.defineProperty(textarea, "scrollHeight", { value: 20, writable: true, configurable: true });

      chatMessages.autoResize!.call({}, textarea);

      expect(textarea.style.height).toBe("20px");
    });
  });

  describe("scrollToBottom", () => {
    test("handles missing element gracefully", () => {
      document.querySelector = () => null;
      expect(() => chatMessages.scrollToBottom!()).not.toThrow();
    });
  });

  describe("setupInfiniteScroll", () => {
    test("does nothing when sentinel not found", () => {
      document.querySelector = () => null;
      expect(() =>
        chatMessages.setupInfiniteScroll!.call({ scrollObserver: null, loadOlderMessages: () => {} }),
      ).not.toThrow();
    });
  });
});
