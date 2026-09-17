// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for src/chat/service/templates.ts: the config-file loader and
 * the chat-setup template helpers. The seed/list paths are covered by
 * src/chat/setup-templates.test.ts; this file covers the config-file loader
 * (loadConfigChatSetupTemplates + findTemplateCandidates + toTemplateDefault)
 * which is exercised in production via server boot but skipped when the
 * configs/templates/chat-setup.yaml fixture is absent.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

import { loadConfigChatSetupTemplates, } from "./templates";

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "loop-lore-templates-test-",),);
},);

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true, },);
},);

const VALID_YAML = [
  "templates:",
  "  - slug: my-rpg",
  "    name: My RPG",
  "    description: A test template",
  "    mode: story",
  "    turnStrategy: round_robin",
  "    visualNovel: false",
  "    worldId: null",
  "    gmConfig: null",
  "    features: [rpg mode, no assistant]",
  "    visibility: public",
  "",
].join("\n",);

const MIXED_YAML = [
  "templates:",
  "  - slug: ok-template",
  "    name: OK",
  "  - name: missing-slug",
  "  - slug: missing-name",
  "  - not-valid: true",
  "",
].join("\n",);

const VN_YAML = [
  "templates:",
  "  - slug: vn-test",
  "    name: VN",
  "    visualNovel: true",
  "",
].join("\n",);

const TOML_TEMPLATE = [
  "[[templates]]",
  'slug = "toml-rpg"',
  'name = "TOML RPG"',
  'mode = "direct"',
  "",
].join("\n",);

const YAML_WINS_YAML = "templates:\n  - slug: yaml-wins\n    name: YAML\n";
const YAML_WINS_TOML = '[[templates]]\nslug = "toml-loses"\nname = "TOML"\n';

describe("loadConfigChatSetupTemplates", () => {
  test("returns an empty array when no config dir exists", () => {
    const result = loadConfigChatSetupTemplates(workDir,);
    expect(result,).toEqual([],);
  });

  test("returns an empty array when the configs/templates dir exists but is empty", () => {
    mkdirSync(join(workDir, "configs", "templates",), { recursive: true, },);
    const result = loadConfigChatSetupTemplates(workDir,);
    expect(result,).toEqual([],);
  });

  test("loads YAML templates when chat-setup.yaml is present", () => {
    const dir = join(workDir, "configs", "templates",);
    mkdirSync(dir, { recursive: true, },);
    writeFileSync(join(dir, "chat-setup.yaml",), VALID_YAML,);

    const result = loadConfigChatSetupTemplates(workDir,);
    expect(result.length,).toBe(1,);
    expect(result[0]!.slug,).toBe("my-rpg",);
    expect(result[0]!.name,).toBe("My RPG",);
    expect(result[0]!.mode,).toBe("story",);
    expect(result[0]!.turn_strategy,).toBe("round_robin",);
    expect(result[0]!.visibility,).toBe("public",);
    expect(result[0]!.features,).toEqual(["rpg mode", "no assistant",],);
  });

  test("skips entries missing slug or name", () => {
    const dir = join(workDir, "configs", "templates",);
    mkdirSync(dir, { recursive: true, },);
    writeFileSync(join(dir, "chat-setup.yaml",), MIXED_YAML,);

    const result = loadConfigChatSetupTemplates(workDir,);
    expect(result.length,).toBe(1,);
    expect(result[0]!.slug,).toBe("ok-template",);
  });

  test("loads TOML templates when chat-setup.toml is present and no YAML", () => {
    const dir = join(workDir, "configs", "templates",);
    mkdirSync(dir, { recursive: true, },);
    writeFileSync(join(dir, "chat-setup.toml",), TOML_TEMPLATE,);

    const result = loadConfigChatSetupTemplates(workDir,);
    expect(result.length,).toBe(1,);
    expect(result[0]!.slug,).toBe("toml-rpg",);
  });

  test("prefers YAML when both YAML and TOML exist", () => {
    const dir = join(workDir, "configs", "templates",);
    mkdirSync(dir, { recursive: true, },);
    writeFileSync(join(dir, "chat-setup.yaml",), YAML_WINS_YAML,);
    writeFileSync(join(dir, "chat-setup.toml",), YAML_WINS_TOML,);

    const result = loadConfigChatSetupTemplates(workDir,);
    expect(result.length,).toBe(1,);
    expect(result[0]!.slug,).toBe("yaml-wins",);
  });

  test("returns empty array for malformed YAML", () => {
    const dir = join(workDir, "configs", "templates",);
    mkdirSync(dir, { recursive: true, },);
    writeFileSync(join(dir, "chat-setup.yaml",), "this: is: not: valid: yaml: [\n",);
    const result = loadConfigChatSetupTemplates(workDir,);
    expect(result,).toEqual([],);
  });

  test("returns empty array when file declares no templates array", () => {
    const dir = join(workDir, "configs", "templates",);
    mkdirSync(dir, { recursive: true, },);
    writeFileSync(join(dir, "chat-setup.yaml",), "otherKey: 42\n",);
    const result = loadConfigChatSetupTemplates(workDir,);
    expect(result,).toEqual([],);
  });

  test("sets gmConfig renderingOverride when visualNovel is true", () => {
    const dir = join(workDir, "configs", "templates",);
    mkdirSync(dir, { recursive: true, },);
    writeFileSync(join(dir, "chat-setup.yaml",), VN_YAML,);
    const result = loadConfigChatSetupTemplates(workDir,);
    expect(result.length,).toBe(1,);
    expect(result[0]!.gmConfig,).toContain("visual_novel",);
  });
});
