// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the settings workflows Alpine mixin
 * (src/frontend/alpine/settings/workflows.ts).
 *
 * Same harness as quota.test.ts: the mixin talks through the ambient
 * `apiFetch` global, stubbed per test.
 */
import "../i18n.test-helper";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { WorkflowCatalogEntry, } from "./types";
import { workflows, } from "./workflows";

type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;

interface Host {
  workflowUseCases: WorkflowCatalogEntry[];
  workflowSelections: Record<string, string>;
  persistSettings(patch: Record<string, unknown>,): Promise<void>;
  loadWorkflowSelections(): Promise<void>;
  onWorkflowChange(useCase: string, workflowId: string,): Promise<void>;
  workflowUseCaseLabel(useCase: string,): string;
}

const globals = globalThis as unknown as Record<string, unknown>;
const originalApiFetch = globals.apiFetch;

let handler: ApiFetchMock = async () => Response.json({},);
let persisted: Record<string, unknown>[] = [];

function freshHost(): Host {
  const host = {
    workflowUseCases: [],
    workflowSelections: {},
    persistSettings: async (patch: Record<string, unknown>,) => {
      persisted.push(patch,);
    },
  } as unknown as Host;

  Object.assign(host, workflows(),);
  return host;
}

beforeEach(() => {
  persisted = [];
  handler = async () => Response.json({},);
  globals.apiFetch = (url: string, opts?: RequestInit,) => handler(url, opts,);
},);

afterEach(() => {
  globals.apiFetch = originalApiFetch;
},);

describe("settings workflows mixin", () => {
  test("loadWorkflowSelections maps selected entries into selections", async () => {
    handler = async () =>
      Response.json({
        useCases: [
          { useCase: "image.generate", selected: "sdxl", supported: ["sdxl", "krea2",], },
          { useCase: "video.generate", selected: "", supported: ["minimax-h3-image",], },
        ],
      },);

    const host = freshHost();
    await host.loadWorkflowSelections();
    expect(host.workflowUseCases,).toHaveLength(2,);
    expect(host.workflowSelections,).toEqual({ "image.generate": "sdxl", },);
  });

  test("loadWorkflowSelections leaves state alone when the fetch fails", async () => {
    handler = async () => {
      throw new Error("offline",);
    };

    const host = freshHost();
    await host.loadWorkflowSelections();
    expect(host.workflowUseCases,).toEqual([],);
    expect(host.workflowSelections,).toEqual({},);
  });

  test("onWorkflowChange merges one choice and persists the whole object", async () => {
    const host = freshHost();
    host.workflowSelections = { "image.generate": "sdxl", };
    await host.onWorkflowChange("video.generate", "minimax-h3-image",);
    expect(host.workflowSelections,).toEqual({
      "image.generate": "sdxl",
      "video.generate": "minimax-h3-image",
    },);

    expect(persisted,).toEqual([{
      workflowSelections: {
        "image.generate": "sdxl",
        "video.generate": "minimax-h3-image",
      },
    },],);
  });

  test("workflowUseCaseLabel names known cases and passes unknown ids through", () => {
    const host = freshHost();
    expect(host.workflowUseCaseLabel("image.generate",),).toBe("Image generation",);
    expect(host.workflowUseCaseLabel("custom.nope",),).toBe("custom.nope",);
  });
});
