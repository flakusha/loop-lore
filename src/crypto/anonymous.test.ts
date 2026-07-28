/**
 * Tests for crypto/anonymous.ts — Anonymous chat mode
 */

import { afterAll, describe, expect, test, } from "bun:test";
import {
  getAnonymousAvatar,
  getAnonymousDisplayName,
  initAnonymousMode,
  isAnonymousModeEnabled,
} from "./anonymous";

// Reset state after all tests
afterAll(() => {
  initAnonymousMode({ encryption: { anonymous: false, }, } as any,);
},);

describe("initAnonymousMode / isAnonymousModeEnabled", () => {
  test("enabled when config.encryption.anonymous is true", () => {
    initAnonymousMode({ encryption: { anonymous: true, }, } as any,);
    expect(isAnonymousModeEnabled(),).toBe(true,);
  });

  test("disabled when config.encryption.anonymous is false", () => {
    initAnonymousMode({ encryption: { anonymous: false, }, } as any,);
    expect(isAnonymousModeEnabled(),).toBe(false,);
  });

  test("disabled when config.encryption.anonymous is undefined", () => {
    initAnonymousMode({ encryption: {}, } as any,);
    expect(isAnonymousModeEnabled(),).toBe(false,);
  });
});

describe("getAnonymousDisplayName", () => {
  test("admin always sees real name", () => {
    initAnonymousMode({ encryption: { anonymous: true, }, } as any,);
    expect(getAnonymousDisplayName("a1", "Alice", true, false,),).toBe("Alice",);
  });

  test("user always sees their own real name", () => {
    initAnonymousMode({ encryption: { anonymous: true, }, } as any,);
    expect(getAnonymousDisplayName("a1", "Alice", false, true,),).toBe("Alice",);
  });

  test("other users see 'Anonymous' in anonymous mode", () => {
    initAnonymousMode({ encryption: { anonymous: true, }, } as any,);
    expect(getAnonymousDisplayName("a1", "Alice", false, false,),).toBe("Anonymous",);
  });

  test("other users see real name when anonymous mode is disabled", () => {
    initAnonymousMode({ encryption: { anonymous: false, }, } as any,);
    expect(getAnonymousDisplayName("a1", "Alice", false, false,),).toBe("Alice",);
  });
});

describe("getAnonymousAvatar", () => {
  test("admin sees real avatar (null)", () => {
    initAnonymousMode({ encryption: { anonymous: true, }, } as any,);
    expect(getAnonymousAvatar("a1", true, false,),).toBeNull();
  });

  test("self sees real avatar (null)", () => {
    initAnonymousMode({ encryption: { anonymous: true, }, } as any,);
    expect(getAnonymousAvatar("a1", false, true,),).toBeNull();
  });

  test("others see placeholder in anonymous mode", () => {
    initAnonymousMode({ encryption: { anonymous: true, }, } as any,);
    expect(getAnonymousAvatar("a1", false, false,),).toBe("👤",);
  });

  test("others see real avatar when anonymous mode is disabled", () => {
    initAnonymousMode({ encryption: { anonymous: false, }, } as any,);
    expect(getAnonymousAvatar("a1", false, false,),).toBeNull();
  });
});
