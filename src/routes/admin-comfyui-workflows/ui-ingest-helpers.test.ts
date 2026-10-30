// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * UI-ingest route helpers: upload/metadata narrowers.
 *
 * Covers the route-level NEW test-gaps the derivation branch adds —
 * `uploadedUiWorkflow`, `categoryOf`, `outputKindOf`, `snapshotOf`,
 * `ingestUpload`, `ingestErrors`, `liveSnapshot`. Pure shapes plus one
 * red-path ingest; no sockets, no DB, no tmp files.
 *
 * Resource contract: in-memory values only; every test passes alone, in
 * any order, and under the default parallel runner.
 */
import { describe, expect, it, } from "bun:test";
import { IngestError, } from "../../generation/comfyui-params/ingest";
import { uploadedUiWorkflow, } from "./payload";
import {
  categoryOf,
  ingestErrors,
  ingestUpload,
  liveSnapshot,
  outputKindOf,
  snapshotOf,
} from "./ui-ingest";

const UI = {
  nodes: [{ id: 1, type: "KSampler", inputs: [], outputs: [], },],
} as unknown as Parameters<typeof uploadedUiWorkflow>[0];

describe("ui-ingest route helpers", () => {
  it("finds a UI-format upload under wrappers or bare", () => {
    expect(uploadedUiWorkflow({ workflow: UI, },),).not.toBeNull();
    expect(uploadedUiWorkflow(UI,),).not.toBeNull();
    expect(uploadedUiWorkflow({ nope: true, },),).toBeNull();
    expect(uploadedUiWorkflow(null,),).toBeNull();
  });

  it("narrows category and output kind with safe defaults", () => {
    expect(categoryOf("txt2img",),).toBe("txt2img",);
    expect(categoryOf("whatever",),).toBe("txt2img",);
    expect(outputKindOf({},),).toBe("image",);
    expect(outputKindOf({ expectedOutputKind: "video", },),).toBe("video",);
  });

  it("projects a live node-info map onto the snapshot shape", () => {
    const snapshot = snapshotOf({
      KSampler: { input: { required: { seed: ["INT",], }, }, output: {}, } as never,
    },);

    expect(Object.keys(snapshot,),).toEqual(["KSampler",],);

    expect(snapshot.KSampler.input_order.required,).toEqual(["seed",],);
  });

  it("returns red diagnostics (no row) for an empty upload", () => {
    const result = ingestUpload({
      upload: { nodes: [], } as never,
      workflowId: "x",
      meta: {},
      deps: { snapshot: {}, expectedOutputKind: "image", },
    },);

    expect(result.ok,).toBe(false,);

    if (result.ok) { return; }
    expect(result.probe.ok,).toBe(false,);
  });

  it("surfaces ingest failures as message strings", () => {
    expect(ingestErrors(["a", "b",],),).toEqual(["a", "b",],);
    expect(ingestErrors(new IngestError({ kind: "unrecognized-format", },),),).toHaveLength(1,);
  });

  it("reports a failed live snapshot instead of throwing", async () => {
    const result = await liveSnapshot();
    expect(typeof result.ok,).toBe("boolean",);
  });
});
