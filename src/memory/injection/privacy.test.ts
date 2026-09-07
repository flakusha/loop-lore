// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { checkInjectionPrivacy, toBasePrivacy, } from "./privacy";
import type { InjectionContext, } from "./types";

/**
 * @param overrides
 */
function makeCtx(overrides: Partial<InjectionContext> = {},): InjectionContext {
  return {
    chatId: "chat-1",
    worldId: null,
    locationId: null,
    isPrivateChat: false,
    participantCount: 3,
    turnNumber: 1,
    currentKeywords: [],
    averageIntimacy: 50,
    moodModifier: 0,
    ...overrides,
  };
}

describe("privacy gaps — toBasePrivacy mapping", () => {
  test("absolute, isolated, and private map to private", () => {
    expect(toBasePrivacy("absolute",),).toBe("private",);
    expect(toBasePrivacy("isolated",),).toBe("private",);
    expect(toBasePrivacy("private",),).toBe("private",);
  });

  test("localized, contextual, and shared map to shared", () => {
    expect(toBasePrivacy("localized",),).toBe("shared",);
    expect(toBasePrivacy("contextual",),).toBe("shared",);
    expect(toBasePrivacy("shared",),).toBe("shared",);
  });

  test("public and secret map to themselves", () => {
    expect(toBasePrivacy("public",),).toBe("public",);
    expect(toBasePrivacy("secret",),).toBe("secret",);
  });
});

describe("privacy gaps — checkInjectionPrivacy gates", () => {
  test("absolute is never shared", () => {
    expect(checkInjectionPrivacy("absolute", makeCtx(),),).toBe(
      "privacy:absolute_never_shared",
    );
    expect(
      checkInjectionPrivacy("absolute", makeCtx({ isPrivateChat: true, worldId: "w", },),),
    ).toBe("privacy:absolute_never_shared",);
  });

  test("isolated requires a private chat", () => {
    expect(checkInjectionPrivacy("isolated", makeCtx(),),).toBe(
      "privacy:isolated_requires_private_chat",
    );
    expect(checkInjectionPrivacy("isolated", makeCtx({ isPrivateChat: true, },),),).toBeNull();
  });

  test("localized requires a world", () => {
    expect(checkInjectionPrivacy("localized", makeCtx(),),).toBe(
      "privacy:localized_requires_world",
    );
    expect(checkInjectionPrivacy("localized", makeCtx({ worldId: "w-1", },),),).toBeNull();
  });

  test("provision-pipeline levels pass through", () => {
    const ctx = makeCtx();
    expect(checkInjectionPrivacy("contextual", ctx,),).toBeNull();
    expect(checkInjectionPrivacy("shared", ctx,),).toBeNull();
    expect(checkInjectionPrivacy("public", ctx,),).toBeNull();
    expect(checkInjectionPrivacy("private", ctx,),).toBeNull();
    expect(checkInjectionPrivacy("secret", ctx,),).toBeNull();
  });
});
