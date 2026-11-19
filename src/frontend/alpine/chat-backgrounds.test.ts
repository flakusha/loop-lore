// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { chatBackgrounds, } from "./chat-backgrounds";
import type { ChatState, } from "./types";

describe("chatBackgrounds.backgroundImageUrl", () => {
  test("derives the raw asset URL from the stored background's asset id", () => {
    const state = {
      ...chatBackgrounds,
      _background: {
        id: "bg-1",
        name: "Forest",
        type: "image",
        location_id: null,
        asset_id: "asset-1",
        config: null,
        priority: 0,
      },
    } as unknown as ChatState;

    expect(chatBackgrounds.backgroundImageUrl!.call(state,),).toBe("/api/v1/assets/asset-1/raw",);
  });

  test("returns null when no background is assigned", () => {
    const state = { ...chatBackgrounds, _background: null, } as unknown as ChatState;

    expect(chatBackgrounds.backgroundImageUrl!.call(state,),).toBeNull();
  });

  test("returns null when the assigned background has no asset", () => {
    const state = {
      ...chatBackgrounds,
      _background: {
        id: "bg-2",
        name: "Plain",
        type: "image",
        location_id: null,
        asset_id: null,
        config: null,
        priority: 0,
      },
    } as unknown as ChatState;

    expect(chatBackgrounds.backgroundImageUrl!.call(state,),).toBeNull();
  });
});
