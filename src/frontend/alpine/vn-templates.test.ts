// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for frontend/alpine/vn-templates.ts — the GM panel over the
 * world-scoped custom-template store (save / export / delete / refresh).
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { getTemplatesForWorld, } from "../vn/templates/template-engine";
import { vnTemplateManagerFactory, } from "./vn-templates";

const WORLD = "tpl-panel-world";

// bun:test has no DOM storage; install a per-test in-memory stub.
const storage = new Map<string, string>();
const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

beforeEach(() => {
  storage.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string,) => storage.get(key,) ?? null,
    setItem: (key: string, value: string,) => void storage.set(key, String(value,),),
    removeItem: (key: string,) => void storage.delete(key,),
  };
},);

afterEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
},);

function templateJson(overrides: Record<string, unknown> = {},): string {
  return JSON.stringify({
    id: "custom_scene",
    name: "Custom Scene",
    description: "",
    worldId: WORLD,
    category: "scene",
    version: 1,
    variables: [],
    body: { layout: "split", transition: "dissolve", },
    tags: [],
    createdAt: "2024-01-01T00:00:00Z",
    modifiedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  },);
}

describe("vnTemplateManagerFactory", () => {
  test("preloads the world's stored templates; empty world gets none", () => {
    storage.set(`vn-templates-${WORLD}`, JSON.stringify([JSON.parse(templateJson({},),),],),);

    const scoped = vnTemplateManagerFactory(WORLD,);
    expect(scoped.templates,).toHaveLength(1,);
    expect(scoped.templates[0]?.id,).toBe("custom_scene",);

    const bare = vnTemplateManagerFactory("",);
    expect(bare.templates,).toEqual([],);
    expect(bare.worldId,).toBe("",);
  });

  test("saveDraft validates and create-or-updates through the store", () => {
    const panel = vnTemplateManagerFactory(WORLD,);

    panel.draftJson = "not json";
    panel.saveDraft();
    expect(panel.error,).toContain("Invalid template JSON",);
    expect(getTemplatesForWorld(WORLD,),).toHaveLength(0,);

    panel.draftJson = templateJson({},);
    panel.saveDraft();
    expect(panel.error,).toBe("",);
    expect(panel.message,).toContain("Custom Scene",);
    expect(panel.templates,).toHaveLength(1,);

    // Same id again = update: version bumps, still one entry.
    panel.draftJson = templateJson({ version: 2, name: "Custom Scene v2", },);
    panel.saveDraft();
    expect(panel.templates,).toHaveLength(1,);
    expect(panel.templates[0]?.version,).toBe(3,);
  });

  test("saveDraft rejects templates scoped to a different world", () => {
    const panel = vnTemplateManagerFactory(WORLD,);
    panel.draftJson = templateJson({ worldId: "other-world", },);
    panel.saveDraft();

    expect(panel.error,).toContain("other-world",);
    expect(getTemplatesForWorld(WORLD,),).toHaveLength(0,);
  });

  test("saveDraft refuses to write without a world scope", () => {
    const panel = vnTemplateManagerFactory("",);
    panel.draftJson = templateJson({},);
    panel.saveDraft();

    expect(panel.error,).toContain("no world",);
    expect(panel.templates,).toEqual([],);
  });

  test("exportTpl copies stored JSON into the draft; unknown ids error", () => {
    storage.set(`vn-templates-${WORLD}`, JSON.stringify([JSON.parse(templateJson({},),),],),);

    const panel = vnTemplateManagerFactory(WORLD,);
    panel.exportTpl("custom_scene",);
    expect(panel.error,).toBe("",);
    expect(JSON.parse(panel.draftJson,).id,).toBe("custom_scene",);

    panel.exportTpl("missing",);
    expect(panel.error,).toContain("missing",);
  });

  test("remove deletes from the store and refreshes the list", () => {
    storage.set(`vn-templates-${WORLD}`, JSON.stringify([JSON.parse(templateJson({},),),],),);

    const panel = vnTemplateManagerFactory(WORLD,);
    expect(panel.templates,).toHaveLength(1,);

    panel.remove("custom_scene",);
    expect(panel.templates,).toEqual([],);
    expect(getTemplatesForWorld(WORLD,),).toEqual([],);
    expect(panel.message,).toContain("custom_scene",);
  });
});
