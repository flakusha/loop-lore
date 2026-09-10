// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  BROWSER_MODEL_CATALOG,
  buildLocalInferenceManifest,
  ELIGIBLE_LOCAL_TASKS,
  isEligibleLocalTask,
  isLocalOnlyLevel,
} from "./manifest";

describe("local inference manifest", () => {
  test("eligible tasks cover only auxiliary work, never main generation", () => {
    expect([...ELIGIBLE_LOCAL_TASKS,],).toEqual(["prompt-improve", "prompt-analyze",],);
    expect(isEligibleLocalTask("prompt-improve",),).toBe(true,);
    expect(isEligibleLocalTask("generate",),).toBe(false,);
    expect(isEligibleLocalTask("",),).toBe(false,);
  });

  test("spellcheck runs locally without a model download", () => {
    expect(isLocalOnlyLevel("spellcheck",),).toBe(true,);
    expect(isLocalOnlyLevel("creative",),).toBe(false,);
    expect(isLocalOnlyLevel("style-chat",),).toBe(false,);
  });

  test("manifest is versioned and lists small models only", () => {
    const manifest = buildLocalInferenceManifest();
    expect(manifest.version,).toBe(1,);
    expect(manifest.eligibleTasks,).toEqual(["prompt-improve", "prompt-analyze",],);
    expect(manifest.models.length,).toBeGreaterThan(0,);
    for (const model of BROWSER_MODEL_CATALOG) {
      expect(model.approxSizeMB,).toBeLessThanOrEqual(500,);
      expect(model.cdn.startsWith("https://",),).toBe(true,);
    }
  });
});
