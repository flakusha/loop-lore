// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Tests for assistant workflow template loading: merge strategies,
// validation, multi-file discovery, and loader wiring.

import { describe, expect, test, } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, } from "node:fs";
import path from "node:path";
import type { WorkflowTemplateConfig, } from "./sections/templates";
import { findWorkflowFiles, } from "./templates-loader/discovery";
import { loadTemplateConfig, mergeWorkflowConfig, } from "./templates-loader/index";
import { validateWorkflowConfig, } from "./templates-loader/validation";

const BASE: WorkflowTemplateConfig = {
  merge: "extend",
  workflows: {
    "video-minimax-h3": {
      id: "video-minimax-h3",
      name: "Minimax H3",
      steps: [
        {
          id: "subject",
          name: "Subject",
          type: "text",
          formatTemplate: "Subject: {value}",
        },
      ],
      dispatch: {
        backend: "generation-video",
        target: "POST /api/generation/video",
        payloadTemplate: { prompt: "{prompt}", },
      },
    },
  },
};

describe("mergeWorkflowConfig", () => {
  test("extend keeps base on id conflict and adds new ids", () => {
    const merged = mergeWorkflowConfig(
      BASE,
      { workflows: { "image-flux": BASE.workflows["video-minimax-h3"]!, }, },
      "extend",
    );
    expect(Object.keys(merged.workflows,).sort(),).toEqual(
      ["image-flux", "video-minimax-h3",],
    );
  });

  test("override lets the override win on id conflict", () => {
    const replacement = {
      ...BASE.workflows["video-minimax-h3"]!,
      name: "Minimax H3 v2",
    };
    const merged = mergeWorkflowConfig(
      BASE,
      { workflows: { "video-minimax-h3": replacement, }, },
      "override",
    );
    expect(merged.workflows["video-minimax-h3"]?.name,).toBe("Minimax H3 v2",);
  });

  test("replace discards base workflows", () => {
    const merged = mergeWorkflowConfig(BASE, { workflows: {}, }, "replace",);
    expect(merged.workflows,).toEqual({},);
  });
});

describe("validateWorkflowConfig", () => {
  test("accepts single-file and bare-map shapes", () => {
    expect(() => validateWorkflowConfig({ workflows: BASE.workflows, },)).not.toThrow();
    expect(() => validateWorkflowConfig({ ...BASE.workflows, },)).not.toThrow();
  });

  test("rejects choice steps without options and bad step types", () => {
    expect(() =>
      validateWorkflowConfig({
        workflows: {
          bad: {
            steps: [{ id: "s", name: "S", type: "choice", formatTemplate: "x", },],
          },
        },
      },)
    ).toThrow("options must be an array",);
    expect(() =>
      validateWorkflowConfig({
        workflows: {
          bad: {
            steps: [{ id: "s", name: "S", type: "slider", formatTemplate: "x", },],
          },
        },
      },)
    ).toThrow("must be one of",);
  });
});

describe("findWorkflowFiles + loadTemplateConfig", () => {
  test("discovers workflows dir and merges entries into config", () => {
    const dir = path.join(
      import.meta.dir,
      "..",
      "..",
      ".test-workflows-",
      `${Date.now()}`,
    );
    const workflowsDir = path.join(dir, "configs", "templates", "workflows",);
    mkdirSync(workflowsDir, { recursive: true, },);
    writeFileSync(
      path.join(workflowsDir, "extra.yaml",),
      [
        "merge: extend",
        "workflows:",
        "  test-extra:",
        "    id: test-extra",
        "    name: Extra",
        "    steps:",
        "      - id: s",
        "        name: S",
        "        type: text",
        "        formatTemplate: 'S: {value}'",
        "    dispatch:",
        "      backend: b",
        "      target: t",
        "      payloadTemplate: {}",
        "",
      ].join("\n",),
    );
    try {
      const found = findWorkflowFiles(dir,);
      expect(found.length,).toBe(1,);
      const config = loadTemplateConfig(dir,);
      expect(config.workflows.workflows["test-extra"]?.name,).toBe("Extra",);
    } finally {
      rmSync(dir, { recursive: true, force: true, },);
    }
  });
});
