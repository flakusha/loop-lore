/**
 * Tests for frontend/alpine/config-menu.ts — catalog grouping, per-type
 * coercion/validation, and the Alpine state factory (dirty tracking, save
 * batching, role gating of editable fields).
 */

import { describe, expect, test, } from "bun:test";
import {
  coerceFieldValue,
  type ConfigMenuField,
  type ConfigMenuSection,
  createConfigMenuState,
  groupSections,
  validateFieldValue,
} from "./config-menu";

function field(overrides: Partial<ConfigMenuField> = {},): ConfigMenuField {
  return {
    key: "k",
    label: "K",
    type: "string",
    required: false,
    secret: false,
    restart: false,
    perChat: false,
    editable: true,
    scope: "admin",
    ...overrides,
  };
}

function section(key: string, group: string | undefined, fields: ConfigMenuField[],): ConfigMenuSection {
  return {
    key,
    title: key,
    group,
    scope: "admin",
    fields,
  };
}

describe("groupSections", () => {
  test("buckets sections by group preserving catalog order", () => {
    const sections = [
      section("server", "Core", [],),
      section("db", "Core", [],),
      section("auth", "Security", [],),
    ];

    expect(groupSections(sections,),).toEqual([
      { group: "Core", sections: [sections[0]!, sections[1]!,], },
      { group: "Security", sections: [sections[2]!,], },
    ],);
  });

  test("assigns ungrouped sections to Other", () => {
    const sections = [section("solo", undefined, [],),];
    expect(groupSections(sections,),).toEqual([
      { group: "Other", sections: [sections[0]!,], },
    ],);
  });

  test("returns an empty list for no sections", () => {
    expect(groupSections([],),).toEqual([],);
  });
});

describe("coerceFieldValue", () => {
  test("coerces boolean from string and boolean", () => {
    const f = field({ type: "boolean", },);
    expect(coerceFieldValue(f, "true",),).toBe(true,);
    expect(coerceFieldValue(f, true,),).toBe(true,);
    expect(coerceFieldValue(f, "false",),).toBe(false,);
    expect(coerceFieldValue(f, false,),).toBe(false,);
  });

  test("coerces number from string", () => {
    const f = field({ type: "number", },);
    expect(coerceFieldValue(f, "42",),).toBe(42,);
    expect(coerceFieldValue(f, 7,),).toBe(7,);
  });

  test("passes through non-finite numbers unchanged", () => {
    const f = field({ type: "number", },);
    expect(coerceFieldValue(f, "abc",),).toBe("abc",);
  });

  test("parses JSON for array and object", () => {
    const arr = field({ type: "array", },);
    expect(coerceFieldValue(arr, "[1,2]",),).toEqual([1, 2,],);
    const obj = field({ type: "object", },);
    expect(coerceFieldValue(obj, '{"a":1}',),).toEqual({ a: 1, },);
  });

  test("returns raw string unchanged when JSON is invalid", () => {
    const f = field({ type: "array", },);
    expect(coerceFieldValue(f, "not json",),).toBe("not json",);
  });

  test("stringifies null/undefined to empty string", () => {
    const f = field({ type: "string", },);
    expect(coerceFieldValue(f, null,),).toBe("",);
    expect(coerceFieldValue(f, undefined,),).toBe("",);
    expect(coerceFieldValue(f, "x",),).toBe("x",);
  });
});

describe("validateFieldValue", () => {
  test("accepts valid numbers", () => {
    const f = field({ type: "number", },);
    expect(validateFieldValue(f, "42",),).toBeNull();
    expect(validateFieldValue(f, "abc",),).not.toBeNull();
  });

  test("rejects disallowed enum values", () => {
    const f = field({ type: "enum", options: ["a", "b",], },);
    expect(validateFieldValue(f, "a",),).toBeNull();
    expect(validateFieldValue(f, "c",),).not.toBeNull();
  });

  test("rejects broken JSON for array/object", () => {
    const f = field({ type: "array", },);
    expect(validateFieldValue(f, "[1]",),).toBeNull();
    expect(validateFieldValue(f, "[1",),).not.toBeNull();
  });

  test("allows empty optional fields", () => {
    const f = field({ type: "string", required: false, },);
    expect(validateFieldValue(f, "",),).toBeNull();
  });
});

describe("createConfigMenuState", () => {
  function jsonResponse(body: unknown,): Response {
    return new Response(JSON.stringify(body,), {
      status: 200,
      headers: { "Content-Type": "application/json", },
    },);
  }

  test("init loads catalog and selects the first section", async () => {
    const sections = [
      section("server", "Core", [field({ key: "port", type: "number", default: 3000, },),],),
      section("auth", "Security", [field({ key: "token", type: "string", },),],),
    ];

    const state = createConfigMenuState({
      fetch: async () => jsonResponse({ role: "admin", sections, },),
    },);

    await state.init();

    expect(state.loading,).toBe(false,);
    expect(state.role,).toBe("admin",);
    expect(state.activeSection,).toBe("server",);
    expect(state.activeGroup,).toBe("Core",);
    expect(state.values.port,).toBe(3000,);
  });

  test("tracks dirtiness per field", () => {
    const state = createConfigMenuState({ fetch: async () => jsonResponse({ role: "user", sections: [], },), },);
    const f = field({ key: "theme", type: "string", scope: "user", default: "dark", },);
    state.values.theme = "dark";
    state.baseline.theme = "dark";
    state.setValue(f, "light",);
    expect(state.isDirty("theme",),).toBe(true,);
    expect(state.dirty,).toBe(true,);
    state.setValue(f, "dark",);
    expect(state.isDirty("theme",),).toBe(false,);
    expect(state.dirty,).toBe(false,);
  });

  test("saveAll batches only dirty editable valid fields", async () => {
    const sections = [
      section("server", "Core", [
        field({ key: "port", type: "number", default: 3000, },),
        field({ key: "host", type: "string", default: "localhost", },),
        field({ key: "locked", type: "string", editable: false, default: "x", },),
      ],),
    ];

    const calls: { key: string; value: unknown }[] = [];

    const state = createConfigMenuState({
      fetch: async (_url: string, opts?: RequestInit,) => {
        if (opts?.method === "PATCH") {
          const body = JSON.parse(opts.body as string,) as { key: string; value: unknown };
          calls.push(body,);
          return new Response("ok", { status: 200, },);
        }

        return jsonResponse({ role: "admin", sections, },);
      },
    },);

    await state.init();

    state.setValue(sections[0]!.fields[0]!, "8080",);
    state.setValue(sections[0]!.fields[1]!, "0.0.0.0",);
    state.setValue(sections[0]!.fields[2]!, "changed",);
    await state.saveAll();

    expect(calls,).toEqual([
      { key: "port", value: 8080, },
      { key: "host", value: "0.0.0.0", },
    ],);

    expect(state.saveState,).toBe("saved",);
    expect(state.dirty,).toBe(false,);
  });

  test("saveAll keeps failed keys dirty and reports an error", async () => {
    const sections = [
      section("server", "Core", [field({ key: "port", type: "number", default: 3000, },),],),
    ];

    const state = createConfigMenuState({
      fetch: async (_url: string, opts?: RequestInit,) => {
        if (opts?.method === "PATCH") { throw new Error("network",); }
        return jsonResponse({ role: "admin", sections, },);
      },
    },);

    await state.init();

    state.setValue(sections[0]!.fields[0]!, "8080",);
    await state.saveAll();

    expect(state.saveState,).toBe("error",);
    expect(state.dirty,).toBe(true,);
    expect(state.errorMessage,).toContain("port",);
  });

  test("pendingKeys excludes invalid values", () => {
    const state = createConfigMenuState({ fetch: async () => jsonResponse({ role: "user", sections: [], },), },);
    const f = field({ key: "port", type: "number", scope: "user", },);

    state.values.port = "abc";
    state.baseline.port = 3000;
    state.setValue(f, "abc",);

    expect(state.pendingKeys(),).toEqual([],);
  });

  test("role gating: non-admin cannot edit admin-scope fields", async () => {
    const sections = [
      section("server", "Core", [field({ key: "secret", type: "string", scope: "admin", editable: true, },),],),
      section("preferences", "Preferences", [
        field({ key: "theme", type: "string", scope: "user", editable: true, },),
      ],),
    ];

    const state = createConfigMenuState({ fetch: async () => jsonResponse({ role: "user", sections, },), },);
    await state.init();

    state.setValue(sections[0]!.fields[0]!, "x",);
    state.setValue(sections[1]!.fields[0]!, "dark",);

    const pending = state.pendingKeys().map((p,) => p.key);
    expect(pending,).not.toContain("secret",);
    expect(pending,).toContain("theme",);
  });
});
