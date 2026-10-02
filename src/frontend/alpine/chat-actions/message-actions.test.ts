// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Behavior tests for the message action row (TASK-chat-feature-component-buttons):
 * per-message Improve (prompt→PATCH→in-place splice, AC2), the extensible
 * asset-picker kind registry (AC7), picker loading, and attach flow.
 */
import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import type { ApiFetchMock, Toast, } from "../../tests/test-types";
import { ASSET_PICKER_KINDS, filterPickerAssets, messageActions, } from "./message-actions";

// ── Mock ../htmx (must precede importing ./message-actions) ──
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

if (ISOLATED) {
  mock.module("../htmx", () => ({
    apiFetch: (async (url: string, opts?: RequestInit,) => {
      calls.push({ url, opts: opts ?? {}, },);
      return handler(url, opts,);
    }) satisfies ApiFetchMock,
  }),);
}

interface MsgRow {
  id: string;
  role: string;
  content: string;
  edited_at?: string;
  attachments?: { assetId: string }[];
}

interface ActionCtx {
  activeChat: string | null;
  isGroupChat: boolean;
  messages: MsgRow[];
  _improvingMessageId: string | null;
  _assetPickerFor: string | null;
  _assetPickerAssets: { id: string; type?: string; mime_type?: string }[];
  _assetPickerLoading: boolean;
  toasts: Toast[];
  $dispatch?: (event: string, detail?: unknown,) => void;
  closeAssetPicker: () => void;
}

/**
 * Build a minimal chat-state context with one user + one assistant message.
 * @param overrides
 * @returns Test context
 */
function buildCtx(overrides?: Partial<ActionCtx>,): ActionCtx {
  const ctx: ActionCtx = {
    activeChat: "chat-1",
    isGroupChat: false,
    messages: [
      { id: "m1", role: "user", content: "draft prompt", },
      { id: "m2", role: "assistant", content: "reply", },
    ],
    _improvingMessageId: null,
    _assetPickerFor: null,
    _assetPickerAssets: [],
    _assetPickerLoading: false,
    toasts: [],
    $dispatch: (event, detail,) => {
      if (event === "show-toast") {
        ctx.toasts.push(detail as Toast,);
      }
    },
    // Alpine keeps every method on the same state object; mirror that here.
    closeAssetPicker: () => {
      messageActions.closeAssetPicker!.call(ctx as never,);
    },
    ...overrides,
  };
  return ctx;
}

afterEach(() => {
  calls = [];
  handler = async () => Response.json({},);
},);

describeOrSkip("messageActions.improveMessage", () => {
  test("improves a user message in place: prompt → PATCH → splice, no thread reload", async () => {
    const ctx = buildCtx();
    handler = async (url,) => {
      if (url === "/api/v1/generation/prompt") {
        return Response.json({ data: { content: "much better prompt", }, },);
      }
      if (url === "/api/v1/messages/m1") {
        return Response.json({ id: "m1", edited_at: true, },);
      }
      return Response.json({}, { status: 404, },);
    };

    await messageActions.improveMessage!.call(ctx as never, "m1",);

    expect(calls,).toHaveLength(2,);
    expect(calls[0]?.url,).toBe("/api/v1/generation/prompt",);
    expect(JSON.parse(calls[0]?.opts.body as string,),).toEqual({
      mode: "improve",
      level: "style-chat",
      text: "draft prompt",
      chatId: "chat-1",
    },);
    expect(calls[1]?.url,).toBe("/api/v1/messages/m1",);
    expect(calls[1]?.opts.method,).toBe("PATCH",);
    expect(JSON.parse(calls[1]?.opts.body as string,),).toEqual({ content: "much better prompt", },);
    // In-place splice: same message object, mutated — no list fetch (AC2).
    expect(ctx.messages[0]?.content,).toBe("much better prompt",);
    expect(ctx.messages[0]?.edited_at?.length,).toBeGreaterThan(0,);
    expect(calls.some((c,) => c.url.includes("/chats/chat-1/messages",)),).toBe(false,);
    expect(ctx.toasts[0]?.type,).toBe("success",);
    expect(ctx._improvingMessageId,).toBeNull();
  });

  test("uses the group level in group chats", async () => {
    const ctx = buildCtx({ isGroupChat: true, },);
    handler = async (url,) =>
      url === "/api/v1/generation/prompt"
        ? Response.json({ data: { content: "improved", }, },)
        : Response.json({ id: "m1", },);

    await messageActions.improveMessage!.call(ctx as never, "m1",);

    expect(JSON.parse(calls[0]?.opts.body as string,).level,).toBe("style-group",);
  });

  test("ignores assistant messages", async () => {
    const ctx = buildCtx();
    await messageActions.improveMessage!.call(ctx as never, "m2",);
    expect(calls,).toEqual([],);
    expect(ctx.messages[1]?.content,).toBe("reply",);
  });

  test("prompt failure toasts an error and never PATCHes", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({ message: "boom", }, { status: 500, },);

    await messageActions.improveMessage!.call(ctx as never, "m1",);

    expect(calls,).toHaveLength(1,);
    expect(ctx.messages[0]?.content,).toBe("draft prompt",);
    expect(ctx.toasts[0]?.type,).toBe("error",);
    expect(ctx._improvingMessageId,).toBeNull();
  });

  test("PATCH failure keeps the original content and toasts an error", async () => {
    const ctx = buildCtx();
    handler = async (url,) =>
      url === "/api/v1/generation/prompt"
        ? Response.json({ data: { content: "improved", }, },)
        : Response.json({ message: "forbidden", }, { status: 403, },);

    await messageActions.improveMessage!.call(ctx as never, "m1",);

    expect(calls,).toHaveLength(2,);
    expect(ctx.messages[0]?.content,).toBe("draft prompt",);
    expect(ctx.toasts[0]?.type,).toBe("error",);
  });
},);

describeOrSkip("asset picker kind registry (AC7)", () => {
  test("default registry keeps images and drops other media", () => {
    const rows = [
      { id: "i1", type: "image", },
      { id: "p1", mime_type: "image/png", },
      { id: "a1", type: "audio", mime_type: "audio/mpeg", },
    ];
    expect(filterPickerAssets(rows,).map((r,) => r.id),).toEqual(["i1", "p1",],);
  });

  test("registering a new kind widens the picker without touching the flow", () => {
    const rows = [
      { id: "i1", type: "image", },
      { id: "a1", type: "audio", mime_type: "audio/mpeg", },
    ];
    const audioKind = {
      kind: "audio",
      label: "Audio",
      matches: (asset: { type?: string },) => asset.type === "audio",
    };
    expect(
      filterPickerAssets(rows, [...ASSET_PICKER_KINDS, audioKind,],).map((r,) => r.id),
    ).toEqual(["i1", "a1",],);
  });
},);

describeOrSkip("messageActions.openAssetPicker", () => {
  test("loads the chat gallery and filters through registered kinds", async () => {
    const ctx = buildCtx();
    handler = async () =>
      Response.json({
        data: [
          { id: "i1", type: "image", },
          { id: "a1", type: "audio", },
        ],
      },);

    await messageActions.openAssetPicker!.call(ctx as never, "m1",);

    expect(calls[0]?.url,).toBe("/api/v1/assets?entity_type=chat&entity_id=chat-1&pageSize=200",);
    expect(ctx._assetPickerFor,).toBe("m1",);
    expect(ctx._assetPickerAssets.map((a,) => a.id),).toEqual(["i1",],);
    expect(ctx._assetPickerLoading,).toBe(false,);
  });

  test("gallery failure closes the picker and toasts an error", async () => {
    const ctx = buildCtx();
    handler = async () => Response.json({}, { status: 500, },);

    await messageActions.openAssetPicker!.call(ctx as never, "m1",);

    expect(ctx._assetPickerFor,).toBeNull();
    expect(ctx.toasts[0]?.type,).toBe("error",);
    expect(ctx._assetPickerLoading,).toBe(false,);
  });
},);

describeOrSkip("messageActions.attachAssetToMessage", () => {
  test("attaches, refreshes the message rows, closes the picker, toasts success", async () => {
    const ctx = buildCtx({ _assetPickerFor: "m1", },);
    handler = async (_url, opts,) => {
      if (opts?.method === "POST") {
        return Response.json({ data: [{ assetId: "a9", },], }, { status: 201, },);
      }
      return Response.json({ attachments: [{ assetId: "a9", },], },);
    };

    await messageActions.attachAssetToMessage!.call(ctx as never, "m1", "a9",);

    expect(calls[0]?.url,).toBe("/api/v1/messages/m1/attachments",);
    expect(calls[0]?.opts.method,).toBe("POST",);
    expect(JSON.parse(calls[0]?.opts.body as string,),).toEqual({ assetId: "a9", },);
    expect(calls[1]?.url,).toBe("/api/v1/messages/m1",);
    expect(ctx.messages[0]?.attachments,).toEqual([{ assetId: "a9", },],);
    expect(ctx._assetPickerFor,).toBeNull();
    expect(ctx.toasts[0]?.type,).toBe("success",);
  });

  test("attach rejection toasts the server error and keeps the picker open", async () => {
    const ctx = buildCtx({ _assetPickerFor: "m1", },);
    handler = async () => Response.json({ message: "Asset not found or not owned by you.", }, { status: 400, },);

    await messageActions.attachAssetToMessage!.call(ctx as never, "m1", "foreign",);

    expect(ctx.messages[0]?.attachments,).toBeUndefined();
    expect(ctx._assetPickerFor,).toBe("m1",);
    expect(ctx.toasts[0]?.type,).toBe("error",);
    expect(ctx.toasts[0]?.message,).toContain("Asset not found",);
  });
},);
