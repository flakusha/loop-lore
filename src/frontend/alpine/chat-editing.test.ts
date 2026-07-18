import { describe, test, expect } from "bun:test";
import { chatEditing } from "./chat-editing";
import type { ChatState } from "./types";

const mockMessage = (id: string, content: string, role: string) => ({
  id,
  content,
  role,
  created_at: new Date().toISOString(),
});

type MockEditState = Pick<ChatState, "messages" | "editingMessageId" | "editContent" | "pendingAssets">;

describe("chatEditing", () => {
  describe("startEdit", () => {
    test("sets editingMessageId and editContent for matching message", () => {
      const mockState: MockEditState = {
        messages: [
          mockMessage("msg-1", "Hello world", "user"),
          mockMessage("msg-2", "Hi there", "assistant"),
        ],
        editingMessageId: null,
        editContent: "",
        pendingAssets: [],
      };

      chatEditing.startEdit!.call(mockState, "msg-1");

      expect(mockState.editingMessageId).toBe("msg-1");
      expect(mockState.editContent).toBe("Hello world");
    });

    test("does nothing when message not found", () => {
      const mockState: MockEditState = {
        messages: [mockMessage("msg-1", "Hello", "user")],
        editingMessageId: null,
        editContent: "",
        pendingAssets: [],
      };

      chatEditing.startEdit!.call(mockState, "msg-99");

      expect(mockState.editingMessageId).toBeNull();
      expect(mockState.editContent).toBe("");
    });

    test("handles empty messages array", () => {
      const mockState: MockEditState = {
        messages: [],
        editingMessageId: null,
        editContent: "",
        pendingAssets: [],
      };

      chatEditing.startEdit!.call(mockState, "msg-1");

      expect(mockState.editingMessageId).toBeNull();
      expect(mockState.editContent).toBe("");
    });
  });

  describe("cancelEdit", () => {
    test("resets editing state", () => {
      const mockState: MockEditState = {
        messages: [],
        editingMessageId: "msg-1",
        editContent: "some text",
        pendingAssets: [],
      };

      chatEditing.cancelEdit!.call(mockState);

      expect(mockState.editingMessageId).toBeNull();
      expect(mockState.editContent).toBe("");
    });

    test("works when no edit is active", () => {
      const mockState: MockEditState = {
        messages: [],
        editingMessageId: null,
        editContent: "",
        pendingAssets: [],
      };

      expect(() => chatEditing.cancelEdit!.call(mockState)).not.toThrow();
      expect(mockState.editingMessageId).toBeNull();
      expect(mockState.editContent).toBe("");
    });
  });

  describe("removePendingAsset", () => {
    test("removes asset by id", () => {
      const mockState: MockEditState = {
        messages: [],
        editingMessageId: null,
        editContent: "",
        pendingAssets: [
          { assetId: "asset-1", filename: "img1.png" },
          { assetId: "asset-2", filename: "img2.png" },
          { assetId: "asset-3", filename: "img3.png" },
        ],
      };

      chatEditing.removePendingAsset!.call(mockState, "asset-2");

      expect(mockState.pendingAssets.length).toBe(2);
      expect(mockState.pendingAssets[0].assetId).toBe("asset-1");
      expect(mockState.pendingAssets[1].assetId).toBe("asset-3");
    });

    test("does nothing for non-existent asset id", () => {
      const mockState: MockEditState = {
        messages: [],
        editingMessageId: null,
        editContent: "",
        pendingAssets: [{ assetId: "asset-1", filename: "img1.png" }],
      };

      chatEditing.removePendingAsset!.call(mockState, "asset-99");

      expect(mockState.pendingAssets.length).toBe(1);
    });

    test("handles empty pending assets", () => {
      const mockState: MockEditState = {
        messages: [],
        editingMessageId: null,
        editContent: "",
        pendingAssets: [],
      };

      chatEditing.removePendingAsset!.call(mockState, "asset-1");

      expect(mockState.pendingAssets.length).toBe(0);
    });
  });
});
