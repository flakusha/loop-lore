// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Contract tests for the typed response-shape schemas (messages list,
 * single/variant reads, admin detail endpoints). Pins the null-vs-absent
 * and raw-vs-enriched distinctions the routes guarantee.
 */
import { describe, expect, test, } from "bun:test";
import { Value, } from "@sinclair/typebox/value";
import {
  MessageAttachmentSchema,
  MessageListItemSchema,
  MessageVariantItemSchema,
} from "./messages";
import {
  AdminChatDetail,
  AdminWorldDetail,
} from "./responses-admin";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("MessageAttachmentSchema", () => {
  test("accepts a fully-populated enriched attachment", () => {
    expect(
      Value.Check(MessageAttachmentSchema, {
        assetId: "asset-1",
        order: 0,
        caption: "a view",
        label: "source",
        url: "/api/assets/asset-1/bytes",
        thumbUrl: "/api/assets/asset-1/thumb",
        filename: "view.png",
        mimeType: "image/png",
        type: "image",
        sizeBytes: 1024,
        durationSecs: 0,
        width: 512,
        height: 512,
        nsfw: false,
      },),
    ).toBe(true,);
  });

  test("rejects a missing required field (thumbUrl is always set)", () => {
    expect(
      Value.Check(MessageAttachmentSchema, {
        assetId: "asset-1",
        order: 0,
        caption: "",
        label: "",
        url: "/api/assets/asset-1/bytes",
        filename: "view.png",
        mimeType: "image/png",
        type: "image",
        sizeBytes: 1024,
        durationSecs: 0,
        width: 512,
        height: 512,
        nsfw: false,
      },),
    ).toBe(false,);
  });
});

describe("MessageListItemSchema", () => {
  test("accepts null attachments and tool_calls (absent means null)", () => {
    expect(
      Value.Check(MessageListItemSchema, {
        id: UUID,
        chat_id: UUID,
        role: "user",
        content: "hi",
        attachments: null,
        tool_calls: null,
        tool_name: null,
        tool_error: false,
        created_at: "2026-11-21T00:00:00.000Z",
      },),
    ).toBe(true,);
  });

  test("rejects a missing attachments key (null, never undefined)", () => {
    expect(
      Value.Check(MessageListItemSchema, {
        id: UUID,
        chat_id: UUID,
        role: "user",
        content: "hi",
        tool_calls: null,
        tool_name: null,
        tool_error: false,
        created_at: "2026-11-21T00:00:00.000Z",
      },),
    ).toBe(false,);
  });

  test("rejects an unknown role", () => {
    expect(
      Value.Check(MessageListItemSchema, {
        id: UUID,
        chat_id: UUID,
        role: "narrator",
        content: "hi",
        attachments: null,
        tool_calls: null,
        tool_name: null,
        tool_error: false,
        created_at: "2026-11-21T00:00:00.000Z",
      },),
    ).toBe(false,);
  });
});

describe("MessageVariantItemSchema", () => {
  test("accepts raw stored JSON strings (unenriched on this path)", () => {
    expect(
      Value.Check(MessageVariantItemSchema, {
        id: UUID,
        chat_id: UUID,
        parent_id: null,
        role: "assistant",
        content: "draft",
        content_type: "text",
        status: "confirmed",
        visibility: "visible",
        attachments: "[{\"assetId\":\"a1\"}]",
        tool_calls: null,
        swipe_index: 0,
        created_at: "2026-11-21T00:00:00.000Z",
      },),
    ).toBe(true,);
  });

  test("rejects an attachments array (must be a stored string here)", () => {
    expect(
      Value.Check(MessageVariantItemSchema, {
        id: UUID,
        chat_id: UUID,
        parent_id: null,
        role: "assistant",
        content: "draft",
        content_type: "text",
        status: "confirmed",
        visibility: "visible",
        attachments: [],
        tool_calls: null,
        swipe_index: 0,
        created_at: "2026-11-21T00:00:00.000Z",
      },),
    ).toBe(false,);
  });
});

describe("AdminChatDetail", () => {
  test("accepts a full detail with participants", () => {
    expect(
      Value.Check(AdminChatDetail, {
        id: UUID,
        name: "tavern",
        type: "group",
        mode: "standard",
        created_by: UUID,
        world_id: null,
        is_pinned: "0",
        visibility: "private",
        encryption_level: "none",
        thinking_visibility: "owner",
        created_at: "2026-11-21T00:00:00.000Z",
        updated_at: "2026-11-21T00:00:00.000Z",
        messageCount: 3,
        participants: [
          { actor_id: UUID, role_in_chat: "member", joined_at: "2026-11-21T00:00:00.000Z", },
        ],
      },),
    ).toBe(true,);
  });

  test("rejects boolean is_pinned (stored text flag, not boolean)", () => {
    expect(
      Value.Check(AdminChatDetail, {
        id: UUID,
        name: "tavern",
        type: "group",
        mode: "standard",
        created_by: UUID,
        world_id: null,
        is_pinned: false,
        visibility: "private",
        encryption_level: "none",
        thinking_visibility: "owner",
        created_at: "2026-11-21T00:00:00.000Z",
        updated_at: "2026-11-21T00:00:00.000Z",
        messageCount: 3,
        participants: [],
      },),
    ).toBe(false,);
  });
});

describe("AdminWorldDetail", () => {
  test("accepts a full detail with location roll-up", () => {
    expect(
      Value.Check(AdminWorldDetail, {
        id: UUID,
        name: "vale",
        description: null,
        owner_id: UUID,
        publication_status: "draft",
        kind: "custom",
        visibility: "private",
        nsfw_override: null,
        rpg_enabled: 0,
        created_at: "2026-11-21T00:00:00.000Z",
        updated_at: "2026-11-21T00:00:00.000Z",
        locationCount: 2,
      },),
    ).toBe(true,);
  });

  test("rejects boolean rpg_enabled (stored numeric flag, not boolean)", () => {
    expect(
      Value.Check(AdminWorldDetail, {
        id: UUID,
        name: "vale",
        description: null,
        owner_id: UUID,
        publication_status: "draft",
        kind: "custom",
        visibility: "private",
        nsfw_override: null,
        rpg_enabled: false,
        created_at: "2026-11-21T00:00:00.000Z",
        updated_at: "2026-11-21T00:00:00.000Z",
        locationCount: 2,
      },),
    ).toBe(false,);
  });
});
