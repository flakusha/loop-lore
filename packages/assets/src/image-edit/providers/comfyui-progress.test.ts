// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Image-edit progress wiring. The real ComfyUIClient already covers `client_id`
 * submission and WS filtering; this suite pins the provider-owned per-call id
 * and the event-to-ImageEditProgress mapping without opening a socket.
 */
import { afterAll, beforeAll, expect, test, } from "bun:test";
import type { Config, } from "../../../../../src/config/schema";
import { setTestDatabase, } from "../../../../../src/db";
import type { ComfyUIClient, } from "../../../../../src/generation/providers/comfyui";
import type { ComfyUIProgressEvent, } from "../../../../../src/generation/providers/comfyui-progress";
import { createTestDb, destroyTestDb, } from "../../../../../src/test-utils/create-test-db";
import { describeOrSkip, } from "../../../../../src/test-utils/isolate-only";
import type { ImageEditProgress, ImageEditRequest, WorkflowTemplate, } from "../types";
import { ComfyUIEditProvider, } from "./comfyui-provider";

type ProgressOptions = {
  clientId: string;
  onProgress: (event: ComfyUIProgressEvent,) => void;
};

class CapturingProvider extends ComfyUIEditProvider {
  clientId?: string;
  progressSink?: (event: ComfyUIProgressEvent,) => void;

  protected override getClient(
    _config?: Config,
    _apiKey?: string,
    progress?: ProgressOptions,
  ): ComfyUIClient {
    this.clientId = progress?.clientId;
    this.progressSink = progress?.onProgress;
    return {
      submitWorkflow: async () => ({ prompt_id: "stub-prompt", }),
      waitForCompletion: async () => [],
    } as unknown as ComfyUIClient;
  }
}

const template: WorkflowTemplate = {
  id: "progress-probe",
  name: "Progress Probe",
  description: "stub",
  category: "txt2img",
  backends: ["comfyui",],
  required_nodes: [],
  parameters: [],
  build: () => ({}),
};

const request: ImageEditRequest = { template_id: "progress-probe", backend: "comfyui", params: {}, };

describeOrSkip("image-edit ComfyUI progress", () => {
  let fixture: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(async () => {
    fixture = await createTestDb();
    setTestDatabase(fixture.db,);
  },);

  afterAll(async () => {
    await destroyTestDb(fixture,);
  },);

  test("execute pins a per-call client id and maps WS progress", async () => {
    const provider = new CapturingProvider();
    const seen: ImageEditProgress[] = [];

    await provider.execute(request, template, {
      ownerId: "progress-user",
      onProgress: (progress,) => {
        seen.push(progress,);
      },
    },);

    expect(provider.clientId,).toMatch(/^[0-9a-f-]{36}$/,);
    expect(provider.progressSink,).not.toBeUndefined();
    provider.progressSink?.({
      promptId: "stub-prompt",
      value: 3,
      max: 4,
      node: "KSampler",
    },);

    expect(seen.at(-1,),).toEqual({
      status: "running",
      progress: 0.75,
      message: "Executing KSampler...",
    },);
  });
  test("execute injects the emotion modifier into template params", async () => {
    const provider = new CapturingProvider();
    let builtWith: Record<string, unknown> = {};
    const spyTemplate: WorkflowTemplate = {
      ...template,
      build: (params,) => {
        builtWith = params;
        return {};
      },
    };
    await provider.execute({ ...request, params: { emotion: "happy", }, }, spyTemplate, {
      ownerId: "emotion-user",
    },);
    expect(builtWith["emotion_modifier"],).toContain("smiling",);
  });
},);
