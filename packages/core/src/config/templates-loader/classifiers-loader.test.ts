// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the classifier template-pack domain: load-time validators,
 * merge strategies, and discovery (including `*.example.*` exclusion).
 *
 * Resource contract: discovery/load tests build their own mkdtemp directory
 * per test under tmpdir(), removed in a finally block, and pass that root to
 * the loader (never the repo cwd); validation/merge tests are pure; no ports,
 * no DB, no global stubs (emitWarning is captured and restored inline).
 */
import { describe, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import path from "node:path";
import type { ClassifiersTemplateConfig, ClassTemplateConfig, } from "../sections/templates";
import { mergeClassifiersConfig, } from "./classifiers-merge";
import {
  validateClassifiersConfig,
  warnUnknownClassifierServes,
} from "./classifiers-validation";
import { findClassifierFiles, } from "./discovery";
import { loadTemplateConfig, } from "./index";

/** Valid minimal pack entry. */
function pack(overrides: Partial<ClassTemplateConfig> = {},): ClassTemplateConfig {
  return {
    id: "scene-pacing",
    name: "Scene pacing",
    serves: ["intent",],
    tags: ["pacing",],
    template: "Decide pacing. Reply JSON.",
    ...overrides,
  };
}

/** Capture `process.emitWarning` calls made while `fn` runs. */
function captureWarnings(fn: () => void,): (string | Error)[][] {
  const calls: (string | Error)[][] = [];
  const orig = process.emitWarning;
  process.emitWarning = ((warning: string | Error,) => {
    calls.push([warning,],);
  }) as typeof process.emitWarning;

  try {
    fn();
  } finally {
    process.emitWarning = orig;
  }

  return calls;
}

describe("validateClassifiersConfig", () => {
  test("accepts a valid bare pack map", () => {
    expect(() => validateClassifiersConfig({ p1: pack(), },)).not.toThrow();
  });

  test("accepts the wrapped `{ classifiers: … }` shape", () => {
    expect(() => validateClassifiersConfig({ classifiers: { p1: pack(), }, merge: "extend", },)).not.toThrow();
  });

  test("throws on a non-object classifiers map", () => {
    expect(() => validateClassifiersConfig({ classifiers: "nope", },)).toThrow(/must be an object/,);
  });

  test("throws on a non-object pack entry", () => {
    expect(() => validateClassifiersConfig({ p1: "nope", },)).toThrow(/p1 must be an object/,);
  });

  test("throws on empty id/name/template", () => {
    expect(() => validateClassifiersConfig({ p1: pack({ id: "", },), },)).toThrow(/id must be a non-empty string/,);
    expect(() => validateClassifiersConfig({ p1: pack({ name: "", },), },)).toThrow(/name must be a non-empty string/,);
    expect(() => validateClassifiersConfig({ p1: pack({ template: "", },), },)).toThrow(
      /template must be a non-empty string/,
    );
  });

  test("throws on unknown serves entries", () => {
    expect(() =>
      validateClassifiersConfig({ p1: { id: "p1", name: "P", serves: ["transiton",], tags: [], template: "t", }, },)
    ).toThrow(
      /not a known AuxTaskName/,
    );
  });

  test("throws on empty or non-array serves", () => {
    expect(() => validateClassifiersConfig({ p1: pack({ serves: [], },), },)).toThrow(/non-empty array/,);
    expect(
      () => validateClassifiersConfig({ p1: { id: "p1", name: "P", serves: "intent", tags: [], template: "t", }, },),
    ).toThrow(/must be a non-empty array/,);
  });

  test("throws on malformed tags / priority / params / labels", () => {
    expect(() => validateClassifiersConfig({ p1: pack({ tags: "pacing", } as never,), },)).toThrow(
      /tags must be an array/,
    );

    expect(() => validateClassifiersConfig({ p1: pack({ tags: [1,], } as never,), },)).toThrow(
      /tags entries must be strings/,
    );

    expect(() => validateClassifiersConfig({ p1: pack({ priority: "10", } as never,), },)).toThrow(
      /priority must be a number/,
    );

    expect(() => validateClassifiersConfig({ p1: pack({ params: { maxTokens: "x", }, } as never,), },)).toThrow(
      /params.maxTokens must be a number/,
    );

    expect(() => validateClassifiersConfig({ p1: pack({ labels: [3,], } as never,), },)).toThrow(
      /labels entries must be strings/,
    );
  });

  test("throws on malformed when.chatMode guards", () => {
    expect(
      () => validateClassifiersConfig({ p1: { ...pack(), when: { chatMode: ["bogus",], }, }, },),
    ).toThrow(/chatMode entries must be one of/,);

    expect(() => validateClassifiersConfig({ p1: pack({ when: { chatMode: [], }, },), },)).toThrow(
      /chatMode must be a non-empty array/,
    );
  });

  test("throws on an illegal merge strategy", () => {
    expect(() => validateClassifiersConfig({ merge: "merge", },)).toThrow(/merge must be one of/,);
  });
});

describe("warnUnknownClassifierServes", () => {
  test("warns on a near-miss serve target", () => {
    const calls = captureWarnings(() => {
      warnUnknownClassifierServes({ p1: { serves: ["transiton",], }, },);
    },);

    expect(calls,).toHaveLength(1,);
    expect(String(calls[0]?.[0],),).toContain('did you mean "transition"',);
  });

  test("stays silent on known tasks and far-miss keys", () => {
    const calls = captureWarnings(() => {
      warnUnknownClassifierServes({ p1: { serves: ["intent", "zzzzzz",], }, },);
    },);

    expect(calls,).toHaveLength(0,);
  });
});

describe("mergeClassifiersConfig", () => {
  const base: ClassifiersTemplateConfig = {
    merge: "extend",
    classifiers: { a: pack({ id: "a", tags: ["base",], priority: 1, },), },
  };

  test("extend keeps base values on id conflict", () => {
    const merged = mergeClassifiersConfig(base, { classifiers: { a: pack({ id: "a", priority: 9, },), }, }, "extend",);
    expect(merged.classifiers.a?.priority,).toBe(1,);
  });

  test("override lets the override win on id conflict", () => {
    const merged = mergeClassifiersConfig(
      base,
      { classifiers: { a: pack({ id: "a", priority: 9, },), }, },
      "override",
    );

    expect(merged.classifiers.a?.priority,).toBe(9,);
  });

  test("replace discards the base entirely", () => {
    const merged = mergeClassifiersConfig(base, { classifiers: { b: pack({ id: "b", },), }, }, "replace",);
    expect(merged.classifiers.a,).toBeUndefined();
    expect(merged.classifiers.b,).toBeDefined();
  });
});

describe("findClassifierFiles", () => {
  test("returns live yaml files and excludes *.example.* docs", () => {
    const root = mkdtempSync(path.join(tmpdir(), "classifiers-",),);
    try {
      const dir = path.join(root, "configs", "templates", "classifiers",);
      mkdirSync(dir, { recursive: true, },);
      writeFileSync(path.join(dir, "packs.yaml",), "classifiers: {}\n",);
      writeFileSync(path.join(dir, "packs.example.yaml",), "classifiers: {}\n",);
      writeFileSync(path.join(dir, "notes.txt",), "nope\n",);

      const found = findClassifierFiles(root,);
      expect(found,).toEqual([path.join(dir, "packs.yaml",),],);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });

  test("loadTemplateConfig layers a pack file into the classifiers section", () => {
    const root = mkdtempSync(path.join(tmpdir(), "classifiers-load-",),);
    try {
      const dir = path.join(root, "configs", "templates", "classifiers",);
      mkdirSync(dir, { recursive: true, },);
      writeFileSync(
        path.join(dir, "packs.yaml",),
        `merge: extend\nclassifiers:\n  scene-pacing:\n    id: scene-pacing\n    name: Pacing\n    serves: [intent]\n    tags: [pacing]\n    priority: 3\n    template: |
      Decide pacing.\n`,
      );

      writeFileSync(path.join(dir, "pacing.example.yaml",), "classifiers: {}\n",);

      const config = loadTemplateConfig(root,);
      expect(Object.keys(config.classifiers.classifiers,),).toEqual(["scene-pacing",],);
      expect(config.classifiers.classifiers["scene-pacing"]?.priority,).toBe(3,);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });
});
