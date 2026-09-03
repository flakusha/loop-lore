// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { applyChatViewDefaults, assertChatViewShape, } from "./store-schema";

describe("store-schema — chat-view defaults + shape assertions", () => {
  describe("applyChatViewDefaults", () => {
    test("seeds children=[] and visibility='visible' on an empty payload", () => {
      const store: Record<string, unknown> = {};
      applyChatViewDefaults(store,);
      expect(Array.isArray(store.children,),).toBe(true,);
      expect(store.children,).toEqual([],);
      expect(store.visibility,).toBe("visible",);
    },);

    test("preserves an existing valid array for children", () => {
      const store: Record<string, unknown> = {
        children: [{ id: "x", },],
        visibility: "hidden",
      };
      applyChatViewDefaults(store,);
      expect(store.children,).toEqual([{ id: "x", },],);
      expect(store.visibility,).toBe("hidden",);
    },);

    test("replaces a non-array children value with []", () => {
      const store: Record<string, unknown> = { children: "not-an-array", };
      applyChatViewDefaults(store,);
      expect(store.children,).toEqual([],);
    },);

    test("replaces an empty-string visibility with 'visible'", () => {
      const store: Record<string, unknown> = { visibility: "", };
      applyChatViewDefaults(store,);
      expect(store.visibility,).toBe("visible",);
    },);

    test("no-ops when given null or a non-object", () => {
      expect(() => applyChatViewDefaults(null,),).not.toThrow();
      expect(() => applyChatViewDefaults(undefined,),).not.toThrow();
      expect(() => applyChatViewDefaults(42 as unknown,),).not.toThrow();
    },);
  },);

  describe("assertChatViewShape", () => {
    let originalNodeEnv: string | undefined;

    beforeEach(() => {
      originalNodeEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;
    },);

    afterEach(() => {
      if (originalNodeEnv === undefined) { delete process.env.NODE_ENV; }
      else { process.env.NODE_ENV = originalNodeEnv; }
    },);

    test("throws when required fields are missing (default bun test env = dev)", () => {
      const store: Record<string, unknown> = {};
      expect(() => assertChatViewShape(store,),).toThrow(/missing required field "currentChat"/,);
    },);

    test("throws when children is the wrong type", () => {
      const store = { currentChat: null, children: "nope", visibility: "visible", };
      expect(() => assertChatViewShape(store,),).toThrow(/chat\.children must be an array/,);
    },);

    test("throws when visibility is empty", () => {
      const store = { currentChat: null, children: [], visibility: "", };
      expect(() => assertChatViewShape(store,),).toThrow(/chat\.visibility must be a non-empty string/,);
    },);

    test("returns silently when payload is well-shaped", () => {
      const store = { currentChat: null, children: [], visibility: "visible", };
      expect(() => assertChatViewShape(store,),).not.toThrow();
    },);

    test("is a no-op in production (NODE_ENV=production)", () => {
      process.env.NODE_ENV = "production";
      const broken: Record<string, unknown> = {};
      // Would throw in dev — must silently no-op in production.
      expect(() => assertChatViewShape(broken,),).not.toThrow();
    },);
  },);
});
