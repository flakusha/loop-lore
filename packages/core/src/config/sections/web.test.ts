// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/web.test.ts — web editor/terminal config section tests

import { describe, expect, test, } from "bun:test";

import { createConfigSchema, envMap, jsonSchema, validate, } from "@/config/schema-class";
import { WEB_DEFAULTS, WebSection, } from "@/config/sections/web";

describe("WebSection", () => {
  test("defaults: editor vscode, terminal disabled and localhost-only", () => {
    const web = new WebSection();
    expect(web.editor,).toBe("vscode",);
    expect(web.terminal.enabled,).toBe(false,);
    expect(web.terminal.allowRemote,).toBe(false,);
    expect(WEB_DEFAULTS.editor,).toBe("vscode",);
  });

  test("nested terminal override merges without clobbering sibling keys", () => {
    const web = new WebSection({ editor: "zed", terminal: { enabled: true, }, },);
    expect(web.editor,).toBe("zed",);
    expect(web.terminal.enabled,).toBe(true,);
    expect(web.terminal.allowRemote,).toBe(false,);
  });

  test("schema factory instances own isolated web sections", () => {
    const first = createConfigSchema().defaults;
    const second = createConfigSchema().defaults;
    expect(first.web,).toEqual(second.web,);
    first.web.terminal.enabled = true;
    expect(second.web.terminal.enabled,).toBe(false,);
  });

  test("jsonSchema includes the web section with nested terminal required", () => {
    const schema = jsonSchema() as {
      properties?: Record<string, { properties?: Record<string, { required?: string[] }> }>;
      required?: string[];
    };

    expect(schema.properties?.web,).toBeDefined();
    expect(schema.properties?.web?.properties?.terminal?.required,).toEqual(["enabled", "allowRemote",],);
    expect(schema.required,).toContain("web",);
  });

  test("envMap carries WEB_EDITOR and nested WEB_TERMINAL_* paths", () => {
    const map = envMap();
    expect(map.WEB_EDITOR,).toBe("web.editor",);
    expect(map.WEB_TERMINAL_ENABLED,).toBe("web.terminal.enabled",);
    expect(map.WEB_TERMINAL_ALLOWREMOTE,).toBe("web.terminal.allowRemote",);
  });

  test("validate rejects blank web.editor and accepts defaults", () => {
    const config = createConfigSchema().defaults;
    validate(config,);
    const broken = structuredClone(config,) as typeof config;
    broken.web.editor = "   ";
    expect(() => validate(broken,)).toThrow(/web\.editor/,);
  });
});
