// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeEach, describe, expect, test, } from "bun:test";
import {
  deleteTemplate,
  exportTemplate,
  getTemplate,
  getTemplatesForWorld,
  importTemplate,
  resolveTemplate,
  resolveVariables,
  saveTemplate,
  substituteTemplate,
  type VnTemplate,
  type VnTemplateVariable,
} from "./template-engine";

/** Minimal Web Storage stub for Bun's test environment (no DOM). */
function createStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key(index,) {
      return Array.from(store.keys(),)[index] ?? null;
    },
    getItem(key,) {
      return store.get(key,) ?? null;
    },
    setItem(key, value,) {
      store.set(key, String(value,),);
    },
    removeItem(key,) {
      store.delete(key,);
    },
    clear() {
      store.clear();
    },
  };
}

function makeVariable(overrides: Partial<VnTemplateVariable> = {},): VnTemplateVariable {
  return { name: "v", type: "string", required: false, ...overrides, };
}

function makeTemplate(overrides: Partial<VnTemplate> = {},): VnTemplate {
  return {
    id: "tpl-1",
    name: "Template One",
    description: "Test template",
    worldId: "world-1",
    category: "scene",
    version: 1,
    variables: [],
    body: { layout: "overlay", transition: "fade-in", },
    tags: [],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("resolveVariables", () => {
  test("context wins; null falls back to default; default used when absent", () => {
    const template = makeTemplate({ variables: [makeVariable({ name: "a", default: "dflt", },),], },);
    expect(resolveVariables(template, { a: "given", },),).toEqual({ a: "given", },);
    expect(resolveVariables(template, { a: null, },),).toEqual({ a: "dflt", },);
    expect(resolveVariables(template, {},),).toEqual({ a: "dflt", },);
  });

  test("missing required variable throws", () => {
    const template = makeTemplate({ variables: [makeVariable({ name: "who", required: true, },),], },);
    expect(() => resolveVariables(template, {},)).toThrow(`Required variable "who" is missing`,);
  });

  test("optional variable resolves to undefined; undeclared context keys are dropped", () => {
    const template = makeTemplate({ variables: [makeVariable({ name: "a", },),], },);
    const resolved = resolveVariables(template, { b: 2, },);
    expect(Object.hasOwn(resolved, "a",),).toBe(true,);
    expect(resolved.a,).toBeUndefined();
    expect(Object.keys(resolved,),).toEqual(["a",],);
  });
});

describe("substituteTemplate", () => {
  test("replaces every placeholder occurrence with primitive values", () => {
    expect(substituteTemplate("{{s}} {{n}} {{b}}", { s: "x", n: 42, b: true, },),).toBe("x 42 true",);
    expect(substituteTemplate("{{a}} and {{a}}", { a: "hi", },),).toBe("hi and hi",);
  });

  test("object value is serialized as JSON", () => {
    expect(substituteTemplate("{{obj}}", { obj: { a: 1, }, },),).toBe(`{"a":1}`,);
  });

  test("unknown, non-word, null, and placeholder-free text stay verbatim", () => {
    expect(substituteTemplate("keep {{missing}}", { a: 1, },),).toBe("keep {{missing}}",);
    expect(substituteTemplate("{{a-b}}", { "a-b": "x", },),).toBe("{{a-b}}",);
    expect(substituteTemplate("plain text", {},),).toBe("plain text",);
    expect(substituteTemplate("{{x}}", { x: null, },),).toBe("{{x}}",);
  });
});

describe("resolveTemplate", () => {
  test("template without a parent (or with a missing one) is returned untouched", () => {
    const template = makeTemplate({},);
    expect(resolveTemplate(template, new Map(),),).toBe(template,);
    const orphan = makeTemplate({ parentTemplateId: "ghost", },);
    expect(resolveTemplate(orphan, new Map(),),).toBe(orphan,);
  });

  test("child fields win; parent-only body keys are inherited", () => {
    const parent = makeTemplate({
      id: "parent",
      name: "Parent",
      body: {
        layout: "split",
        transition: "fade-in",
        portrait: { position: "left", },
        background: { scaling: "cover", },
      },
      variables: [makeVariable({ name: "shared", default: "parent-default", },),],
    },);
    const child = makeTemplate({
      id: "child",
      parentTemplateId: "parent",
      body: { layout: "overlay", transition: "cut", portrait: { position: "right", }, },
      variables: [makeVariable({ name: "shared", default: "child-default", },),],
    },);
    const resolved = resolveTemplate(child, new Map([["parent", parent,],],),);
    expect(resolved.name,).toBe("Template One",);
    expect(resolved.body.layout,).toBe("overlay",);
    expect(resolved.body.transition,).toBe("cut",);
    expect(resolved.body.portrait,).toEqual({ position: "right", },);
    expect(resolved.body.background,).toEqual({ scaling: "cover", },);
  });

  test("inherited variables are prepended; child variables keep their own value", () => {
    const parent = makeTemplate({
      id: "parent",
      variables: [
        makeVariable({ name: "shared", default: "parent", },),
        makeVariable({ name: "only-parent", default: "p", },),
      ],
    },);
    const child = makeTemplate({
      id: "child",
      parentTemplateId: "parent",
      variables: [makeVariable({ name: "shared", default: "child", },),],
    },);
    const resolved = resolveTemplate(child, new Map([["parent", parent,],],),);
    expect(resolved.variables.map((v,) => v.name),).toEqual(["only-parent", "shared",],);
    expect(resolved.variables.find((v,) => v.name === "shared")?.default,).toBe("child",);
  });

  test("inheritance resolves through multiple levels", () => {
    const grandparent = makeTemplate({
      id: "gp",
      body: { layout: "below", transition: "dissolve", portrait: { position: "left", }, },
      variables: [makeVariable({ name: "g", default: "g", },),],
    },);
    const parent = makeTemplate({
      id: "p",
      parentTemplateId: "gp",
      body: { layout: "below", transition: "cut", },
    },);
    const child = makeTemplate({
      id: "c",
      parentTemplateId: "p",
      body: { layout: "overlay", transition: "cut", },
    },);
    const resolved = resolveTemplate(child, new Map([["gp", grandparent,], ["p", parent,],],),);
    expect(resolved.body.layout,).toBe("overlay",);
    expect(resolved.body.transition,).toBe("cut",);
    expect(resolved.body.portrait,).toEqual({ position: "left", },);
    expect(resolved.variables.map((v,) => v.name),).toEqual(["g",],);
  });
});

describe("template storage", () => {
  beforeEach(() => {
    globalThis.localStorage = createStorageStub();
  },);

  test("getTemplatesForWorld returns empty array when nothing stored or corrupted", () => {
    expect(getTemplatesForWorld("w1",),).toEqual([],);
    localStorage.setItem("vn-templates-w1", "{not json",);
    expect(getTemplatesForWorld("w1",),).toEqual([],);
  });

  test("saveTemplate appends with bumped version and fresh modifiedAt", () => {
    saveTemplate(makeTemplate({},),);
    const stored = getTemplatesForWorld("world-1",);
    expect(stored.length,).toBe(1,);
    expect(stored[0]?.version,).toBe(2,);
    expect(Number.isNaN(Date.parse(stored[0]?.modifiedAt ?? "x",),),).toBe(false,);
  });

  test("saveTemplate replaces existing id instead of duplicating", () => {
    saveTemplate(makeTemplate({ name: "first", },),);
    saveTemplate(makeTemplate({ name: "second", },),);
    const stored = getTemplatesForWorld("world-1",);
    expect(stored.length,).toBe(1,);
    expect(stored[0]?.name,).toBe("second",);
    expect(stored[0]?.version,).toBe(2,);
  });

  test("storage is isolated per world", () => {
    saveTemplate(makeTemplate({},),);
    saveTemplate(makeTemplate({ id: "tpl-2", worldId: "world-2", },),);
    expect(getTemplatesForWorld("world-1",).map((t,) => t.id),).toEqual(["tpl-1",],);
    expect(getTemplatesForWorld("world-2",).map((t,) => t.id),).toEqual(["tpl-2",],);
  });

  test("getTemplate finds by id; null for misses", () => {
    saveTemplate(makeTemplate({},),);
    expect(getTemplate("world-1", "tpl-1",)?.id,).toBe("tpl-1",);
    expect(getTemplate("world-1", "nope",),).toBeNull();
    expect(getTemplate("unknown-world", "tpl-1",),).toBeNull();
  });

  test("deleteTemplate removes only the matching id; empty world is a no-op", () => {
    saveTemplate(makeTemplate({},),);
    saveTemplate(makeTemplate({ id: "tpl-2", },),);
    deleteTemplate("world-1", "tpl-1",);
    expect(getTemplatesForWorld("world-1",).map((t,) => t.id),).toEqual(["tpl-2",],);
    deleteTemplate("ghost-world", "tpl-1",);
    expect(getTemplatesForWorld("ghost-world",),).toEqual([],);
  });
});

describe("exportTemplate / importTemplate", () => {
  test("export/import round-trip preserves the template", () => {
    const template = makeTemplate({},);
    expect(importTemplate(exportTemplate(template,),),).toEqual(template,);
  });

  test("import returns null for invalid JSON", () => {
    expect(importTemplate("{oops",),).toBeNull();
  });

  test("import requires id, name, and worldId", () => {
    expect(importTemplate(JSON.stringify({ name: "n", worldId: "w", },),),).toBeNull();
    expect(importTemplate(JSON.stringify({ id: "i", worldId: "w", },),),).toBeNull();
    expect(importTemplate(JSON.stringify({ id: "i", name: "n", },),),).toBeNull();
    expect(importTemplate(JSON.stringify(null,),),).toBeNull();
  });
});
