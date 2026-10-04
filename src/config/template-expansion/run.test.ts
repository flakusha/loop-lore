// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/template-expansion/run.test.ts — Edge cases for run.ts
// (runTemplateExpansion: discovery, result tracking, error containment).

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { createLogger, } from "../../logger";
import type { AvatarTemplateConfig, } from "../sections/templates";
import { runTemplateExpansion, } from "./run";

// runTemplateExpansion logs via getLogger(); ensure a root logger exists.
beforeAll(() => {
  createLogger({ level: "error", },);
},);

// ── Test Data ──────────────────────────────────────────────

const BASE_CONFIG: AvatarTemplateConfig = {
  merge: "extend",
  emotions: {
    happy: { asset: "happy.png", intent: "happy", },
  },
  intentPatterns: [
    { pattern: "smile", emotion: "happy", },
  ],
};

const dirs: string[] = [];

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ll-run-expansion-",),);
  dirs.push(dir,);
  return dir;
}

afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true, },);
  }
},);

function writeExpansion(
  cwd: string,
  location: string,
  filename: string,
  content: string,
): void {
  const dir = join(cwd, location,);
  mkdirSync(dir, { recursive: true, },);
  writeFileSync(join(dir, filename,), content,);
}

// ── runTemplateExpansion ────────────────────────────────────

describe("runTemplateExpansion", () => {
  test("returns the base config unchanged when no expansion file exists", () => {
    const cwd = tmpDir();
    const result = runTemplateExpansion(cwd, BASE_CONFIG,);
    expect(result.config,).toBe(BASE_CONFIG,);
    expect(result.result.keywordsAdded,).toEqual([],);
    expect(result.result.actionsAdded,).toEqual([],);
    expect(result.result.emotionsAdded,).toEqual([],);
    expect(result.result.patternsAdded,).toBe(0,);
    expect(result.result.avatarsGenerated,).toBe(0,);
    expect(result.result.errors,).toEqual([],);
  });

  test("loads expansion from configs/templates/expansion.yaml", () => {
    const cwd = tmpDir();
    writeExpansion(
      cwd,
      "configs/templates",
      "expansion.yaml",
      [
        "merge: extend",
        "emotions:",
        "  sad:",
        "    asset: sad.png",
        "    intent: sad",
        "",
      ].join("\n",),
    );

    const result = runTemplateExpansion(cwd, BASE_CONFIG,);
    expect(result.config.emotions.sad,).toEqual({ asset: "sad.png", intent: "sad", },);
    expect(result.config.emotions.happy,).toEqual({ asset: "happy.png", intent: "happy", },);
    expect(result.result.emotionsAdded,).toEqual(["sad",],);
    expect(result.result.errors,).toEqual([],);
  });

  test("falls back to templates/ expansion dir", () => {
    const cwd = tmpDir();
    writeExpansion(
      cwd,
      "templates",
      "expansion.yml",
      [
        "merge: extend",
        "emotions:",
        "  angry:",
        "    asset: angry.png",
        "    intent: angry",
        "",
      ].join("\n",),
    );

    const result = runTemplateExpansion(cwd, BASE_CONFIG,);
    expect(result.config.emotions.angry,).toBeDefined();
    expect(result.result.emotionsAdded,).toEqual(["angry",],);
  });

  test("configs/templates wins over templates when both exist", () => {
    const cwd = tmpDir();
    writeExpansion(
      cwd,
      "configs/templates",
      "expansion.yaml",
      [
        "emotions:",
        "  from_primary:",
        "    asset: a.png",
        "    intent: a",
        "",
      ].join("\n",),
    );

    writeExpansion(
      cwd,
      "templates",
      "expansion.yaml",
      [
        "emotions:",
        "  from_secondary:",
        "    asset: b.png",
        "    intent: b",
        "",
      ].join("\n",),
    );

    const result = runTemplateExpansion(cwd, BASE_CONFIG,);
    expect(result.config.emotions.from_primary,).toBeDefined();
    expect(result.config.emotions.from_secondary,).toBeUndefined();
  });

  test("tracks keywords, actions, emotions, and pattern counts in the result", () => {
    const cwd = tmpDir();
    writeExpansion(
      cwd,
      "configs/templates",
      "expansion.yaml",
      [
        "merge: extend",
        'keywords: ["k1", "k2"]',
        'actions: ["a1"]',
        "emotions:",
        "  calm:",
        "    asset: calm.png",
        "    intent: calm",
        "intentPatterns:",
        "  - pattern: relax",
        "    emotion: calm",
        "  - pattern: breathe",
        "    emotion: calm",
        "",
      ].join("\n",),
    );

    const result = runTemplateExpansion(cwd, BASE_CONFIG,);
    expect(result.result.keywordsAdded,).toEqual(["k1", "k2",],);
    expect(result.result.actionsAdded,).toEqual(["a1",],);
    expect(result.result.emotionsAdded,).toEqual(["calm",],);
    expect(result.result.patternsAdded,).toBe(2,);
    expect(result.config.intentPatterns.length,).toBe(3,);
  });

  test("parses TOML expansion files", () => {
    const cwd = tmpDir();
    writeExpansion(
      cwd,
      "configs/templates",
      "expansion.toml",
      [
        'merge = "extend"',
        "[emotions.excited]",
        'asset = "excited.png"',
        'intent = "excited"',
        "",
      ].join("\n",),
    );

    const result = runTemplateExpansion(cwd, BASE_CONFIG,);
    expect(result.config.emotions.excited,).toEqual({ asset: "excited.png", intent: "excited", },);
    expect(result.result.emotionsAdded,).toEqual(["excited",],);
  });

  test("merge: replace drops base emotions not present in the expansion", () => {
    const cwd = tmpDir();
    writeExpansion(
      cwd,
      "configs/templates",
      "expansion.yaml",
      [
        "merge: replace",
        "emotions:",
        "  only:",
        "    asset: only.png",
        "    intent: only",
        "",
      ].join("\n",),
    );

    const result = runTemplateExpansion(cwd, BASE_CONFIG,);
    expect(result.config.emotions,).toEqual({ only: { asset: "only.png", intent: "only", }, },);
  });

  test("merge: override replaces base emotions on key conflict", () => {
    const cwd = tmpDir();
    writeExpansion(
      cwd,
      "configs/templates",
      "expansion.yaml",
      [
        "merge: override",
        "emotions:",
        "  happy:",
        "    asset: overridden.png",
        "    intent: overridden",
        "",
      ].join("\n",),
    );

    const result = runTemplateExpansion(cwd, BASE_CONFIG,);
    expect(result.config.emotions.happy,).toEqual({ asset: "overridden.png", intent: "overridden", },);
  });

  test("generateMissingAvatars with missing assets reports zero generated (SD TODO)", () => {
    const cwd = tmpDir();
    writeExpansion(
      cwd,
      "configs/templates",
      "expansion.yaml",
      [
        "merge: extend",
        "generateMissingAvatars: true",
        "emotions:",
        "  missing:",
        '    asset: ""',
        "    intent: missing",
        "",
      ].join("\n",),
    );

    const result = runTemplateExpansion(cwd, BASE_CONFIG,);
    expect(result.result.avatarsGenerated,).toBe(0,);
    expect(result.result.errors,).toEqual([],);
  });

  test("generateMissingAvatars with all assets present succeeds", () => {
    const cwd = tmpDir();
    writeExpansion(
      cwd,
      "configs/templates",
      "expansion.yaml",
      [
        "merge: extend",
        "generateMissingAvatars: true",
        "emotions:",
        "  present:",
        "    asset: present.png",
        "    intent: present",
        "",
      ].join("\n",),
    );

    const result = runTemplateExpansion(cwd, BASE_CONFIG,);
    expect(result.result.avatarsGenerated,).toBe(0,);
    expect(result.result.errors,).toEqual([],);
  });

  test("malformed expansion file is caught: base config returned, error recorded", () => {
    const cwd = tmpDir();
    writeExpansion(cwd, "configs/templates", "expansion.yaml", "emotions: [unterminated\n",);
    const result = runTemplateExpansion(cwd, BASE_CONFIG,);
    expect(result.config,).toBe(BASE_CONFIG,);
    expect(result.result.errors.length,).toBe(1,);
    expect(result.result.errors[0]!,).toMatch(/^Failed to process expansion config: /,);
  });

  test("non-mapping YAML expansion does not crash and keeps base emotions", () => {
    const cwd = tmpDir();
    writeExpansion(cwd, "configs/templates", "expansion.yaml", "- just\n- a\n- list\n",);
    const result = runTemplateExpansion(cwd, BASE_CONFIG,);
    expect(result.config.emotions.happy,).toEqual({ asset: "happy.png", intent: "happy", },);
    expect(result.result.errors,).toEqual([],);
  });

  test("duplicate intent patterns from expansion are deduped", () => {
    const cwd = tmpDir();
    writeExpansion(
      cwd,
      "configs/templates",
      "expansion.yaml",
      [
        "merge: extend",
        "intentPatterns:",
        "  - pattern: smile",
        "    emotion: happy",
        "  - pattern: grin",
        "    emotion: happy",
        "",
      ].join("\n",),
    );

    const result = runTemplateExpansion(cwd, BASE_CONFIG,);
    expect(result.config.intentPatterns.length,).toBe(2,);
    expect(result.result.patternsAdded,).toBe(2,);
  });
});
