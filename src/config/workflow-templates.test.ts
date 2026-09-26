// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Tests for assistant workflow template loading: merge strategies,
// validation, multi-file discovery, and loader wiring.

import { describe, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import path from "node:path";
import type { WorkflowTemplateConfig, } from "./sections/templates";
import { findWorkflowFiles, } from "./templates-loader/discovery";
import { loadTemplateConfig, mergeWorkflowConfig, } from "./templates-loader/index";
import {
  validateEntityTypeConfig,
  validateEntityTypePresets,
  validateWorkflowConfig,
} from "./templates-loader/validation";

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
  entityTypes: {},
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

  test("rejects a non-object workflows table", () => {
    expect(() => validateWorkflowConfig({ workflows: [], },)).toThrow(
      "workflows must be an object mapping id -> workflow",
    );
  });

  test("rejects a non-object workflow entry", () => {
    expect(() => validateWorkflowConfig({ workflows: { flat: "nope", }, },)).toThrow(
      "workflows.flat must be an object",
    );
  });

  test("rejects a non-string id/name/modelFamily/entityType", () => {
    for (const field of ["id", "name", "modelFamily", "entityType",] as const) {
      expect(() => validateWorkflowConfig({ workflows: { w: { [field]: 7, }, }, },)).toThrow(
        `workflows.w.${field} must be a string`,
      );
    }
  });

  test("rejects non-array steps and non-object step entries", () => {
    expect(() => validateWorkflowConfig({ workflows: { w: { steps: "x", }, }, },)).toThrow(
      "workflows.w.steps must be an array",
    );
    expect(() => validateWorkflowConfig({ workflows: { w: { steps: ["flat",], }, }, },)).toThrow(
      "workflows.w.steps[0] must be an object",
    );
  });

  test("rejects a step with an empty id, name, or formatTemplate", () => {
    expect(() =>
      validateWorkflowConfig({
        workflows: { w: { steps: [{ id: "", name: "S", type: "text", formatTemplate: "x", },], }, },
      },)
    ).toThrow("steps[0].id must be a non-empty string",);
    expect(() =>
      validateWorkflowConfig({
        workflows: {
          w: { steps: [{ id: "s", name: "", type: "text", formatTemplate: "x", },], },
        },
      },)
    ).toThrow("steps[0].name must be a non-empty string",);
    expect(() =>
      validateWorkflowConfig({
        workflows: { w: { steps: [{ id: "s", name: "S", type: "text", formatTemplate: "", },], }, },
      },)
    ).toThrow("steps[0].formatTemplate must be a non-empty string",);
  });

  test("rejects non-array recommendations and non-boolean required", () => {
    expect(() =>
      validateWorkflowConfig({
        workflows: {
          w: {
            steps: [{ id: "s", name: "S", type: "text", formatTemplate: "x", recommendations: "no", },],
          },
        },
      },)
    ).toThrow("steps[0].recommendations must be an array",);
    expect(() =>
      validateWorkflowConfig({
        workflows: {
          w: { steps: [{ id: "s", name: "S", type: "text", formatTemplate: "x", required: "yes", },], },
        },
      },)
    ).toThrow("steps[0].required must be a boolean",);
  });

  test("rejects a non-object dispatch and non-array triggers", () => {
    expect(() => validateWorkflowConfig({ workflows: { w: { dispatch: "x", }, }, },)).toThrow(
      "workflows.w.dispatch must be an object",
    );
    expect(() => validateWorkflowConfig({ workflows: { w: { triggers: "x", }, }, },)).toThrow(
      "workflows.w.triggers must be an array",
    );
  });

  test("rejects a malformed intent block", () => {
    expect(() => validateWorkflowConfig({ workflows: { w: { intent: [], }, }, },)).toThrow(
      "workflows.w.intent must be an object",
    );
    expect(() => validateWorkflowConfig({ workflows: { w: { intent: { target: "npc", }, }, }, },)).toThrow(
      "intent.type must be a non-empty string",
    );
    expect(() => validateWorkflowConfig({ workflows: { w: { intent: { type: "generate", target: "", }, }, }, },))
      .toThrow("intent.target must be a non-empty string",);
  });
});

describe("findWorkflowFiles + loadTemplateConfig", () => {
  test("discovers workflows dir and merges entries into config", () => {
    const scratchRoot = path.join(
      import.meta.dir,
      "..",
      "..",
      ".tmp",
      `test-workflows-${crypto.randomUUID().slice(0, 8,)}-${Date.now()}`,
    );
    const dir = scratchRoot;
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
      rmSync(scratchRoot, { recursive: true, force: true, },);
    }
  });
});

describe("entityTypes domain", () => {
  const PRESET = {
    workflowId: "entity-npc",
    requiredSteps: ["name",],
    qualityGates: ["schema", "duplicate",] as ("schema" | "duplicate")[],
    dispatchTarget: "npc",
  };

  test("accepts both the wrapped and bare-map shapes", () => {
    expect(() => validateEntityTypeConfig({ entityTypes: { npc: PRESET, }, },)).not.toThrow();
    expect(() => validateEntityTypeConfig({ npc: PRESET, },)).not.toThrow();
  });

  test("rejects a gate name outside the supported set", () => {
    expect(() => validateEntityTypeConfig({ npc: { ...PRESET, qualityGates: ["vibes",], }, },)).toThrow(
      "qualityGates entries must be one of",
    );
  });

  test("rejects a preset whose workflowId is not loaded", () => {
    expect(() => validateEntityTypePresets({ merge: "extend", workflows: {}, entityTypes: { npc: PRESET, }, },))
      .toThrow("does not match any loaded workflow",);
  });

  test("rejects a requiredStep that is not a step of the workflow", () => {
    expect(() =>
      validateEntityTypePresets({
        merge: "extend",
        workflows: {
          "entity-npc": {
            id: "entity-npc",
            name: "NPC",
            steps: [{ id: "description", name: "D", type: "text", formatTemplate: "D: {value}", },],
            dispatch: { backend: "b", target: "t", payloadTemplate: {}, },
          },
        },
        entityTypes: { npc: PRESET, },
      },)
    ).toThrow("which is not a step of workflow",);
  });

  test("rejects a requiredStep the workflow marks optional", () => {
    expect(() =>
      validateEntityTypePresets({
        merge: "extend",
        workflows: {
          "entity-npc": {
            id: "entity-npc",
            name: "NPC",
            steps: [
              { id: "name", name: "N", type: "text", formatTemplate: "N: {value}", required: false, },
            ],
            dispatch: { backend: "b", target: "t", payloadTemplate: {}, },
          },
        },
        entityTypes: { npc: PRESET, },
      },)
    ).toThrow("marks it required: false",);
  });
});

describe("loadTemplateConfig routes entityTypes out of the workflow domain", () => {
  test("a preset file does not become a workflow and cross-validates", () => {
    const scratchRoot = mkdtempSync(path.join(tmpdir(), "workflow-entity-types-",),);
    const workflowsDir = path.join(scratchRoot, "configs", "templates", "workflows",);
    mkdirSync(workflowsDir, { recursive: true, },);
    writeFileSync(
      path.join(workflowsDir, "entity.yaml",),
      [
        "merge: extend",
        "entityTypes:",
        "  npc:",
        "    workflowId: entity-npc",
        "    requiredSteps: [name]",
        "    qualityGates: [schema]",
        "    dispatchTarget: npc",
        "workflows:",
        "  entity-npc:",
        "    id: entity-npc",
        "    name: NPC",
        "    intent:",
        "      type: generate",
        "      target: npc",
        "    entityType: npc",
        "    steps:",
        "      - id: name",
        "        name: Name",
        "        type: text",
        "        formatTemplate: 'Name: {value}'",
        "      - id: rumour",
        "        name: Rumour",
        "        type: text",
        "        required: false",
        "        formatTemplate: 'Rumour: {value}'",
        "    dispatch:",
        "      backend: assistant-create",
        "      target: /create npc",
        "      payloadTemplate: {}",
        "",
      ].join("\n",),
    );
    try {
      const config = loadTemplateConfig(scratchRoot,);
      // entityTypes must not leak into the workflow table as a workflow id.
      expect(config.workflows.workflows["entityTypes"],).toBeUndefined();
      expect(Object.keys(config.workflows.workflows,),).toEqual(["entity-npc",],);
      expect(config.workflows.entityTypes["npc"]?.dispatchTarget,).toBe("npc",);
      const wf = config.workflows.workflows["entity-npc"]!;
      expect(wf.intent,).toEqual({ type: "generate", target: "npc", },);
      expect(wf.entityType,).toBe("npc",);
      expect(wf.dispatch.target,).toBe("/create npc",);
    } finally {
      rmSync(scratchRoot, { recursive: true, force: true, },);
    }
  });

  test("wraps a bad workflow file with the failing path", () => {
    const scratchRoot = mkdtempSync(path.join(tmpdir(), "workflow-bad-",),);
    const workflowsDir = path.join(scratchRoot, "configs", "templates", "workflows",);
    mkdirSync(workflowsDir, { recursive: true, },);
    writeFileSync(
      path.join(workflowsDir, "broken.yaml",),
      ["workflows:", "  bad:", "    steps: not-an-array", "",].join("\n",),
    );
    try {
      expect(() => loadTemplateConfig(scratchRoot,)).toThrow(
        "Failed to load workflow template",
      );
    } finally {
      rmSync(scratchRoot, { recursive: true, force: true, },);
    }
  });
});
