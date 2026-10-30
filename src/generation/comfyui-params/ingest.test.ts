// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * UI-format ingest: green row plus the two uncertain edges.
 *
 * Green ingests the v-0010 fixture through the full chain; the edges pin
 * fail-closed (probe red yields diagnostics with no row) and idempotent
 * re-ingest (operator labels survive a second run). Format sniffing is
 * certain by construction, so it carries no test.
 *
 * Resource contract: each test rebuilds its own in-memory workflow copy —
 * the fixture file is read fresh and the `[p]` mark applied in memory, so
 * the committed file is never written. Shared state is the fixture plus
 * the snapshot, read-only. No sockets, no tmp files, no DB; every test
 * passes alone, in any order, and under the default parallel runner.
 */
import { describe, expect, it, } from "bun:test";
import { readFileSync, } from "node:fs";
import type { ObjectInfoSnapshot, UiWorkflow, } from "../comfyui-converter/types";
import { rowToPayload, } from "../workflow-library/row";
import { IngestError, type IngestSuccess, ingestWorkflow, } from "./ingest";

const DIR = "src/generation/comfyui-converter/fixtures";

function markedWorkflow(): UiWorkflow {
  const raw = JSON.parse(
    readFileSync(`${DIR}/v-0010-dasiwa-minimax.json`, "utf8",),
  ) as UiWorkflow;

  return {
    ...raw,
    nodes: (raw.nodes ?? []).map((node,) => node.id === 1512 ? { ...node, title: "[p] Settings", } : node),
  };
}

function snapshotOf(): ObjectInfoSnapshot {
  return JSON.parse(readFileSync(`${DIR}/object-info.json`, "utf8",),) as ObjectInfoSnapshot;
}

describe("ingestWorkflow", () => {
  it("ingests the marked v-0010 file to a runnable row", () => {
    const result = ingestWorkflow({
      workflow: markedWorkflow(),
      workflowId: "v-0010",
      snapshot: snapshotOf(),
      expectedOutputKind: "video",
      category: "txt2img",
    },);

    if (!result.ok) {
      throw new Error(`expected green ingest: ${result.probe.errors.join("; ",)}`,);
    }

    const green = result as IngestSuccess;
    expect(green.probe.ok,).toBe(true,);
    expect(green.row.id,).toBe("v-0010",);
    expect(green.row.enabled,).toBe("enabled",);
    expect(green.payload.parameters.length,).toBeGreaterThan(0,);
    const roundTripped = rowToPayload(green.row,);
    expect(roundTripped,).not.toBeNull();
  });

  it("returns no row when the probe is red", () => {
    const result = ingestWorkflow({
      workflow: markedWorkflow(),
      workflowId: "v-0010",
      snapshot: snapshotOf(),
      expectedOutputKind: "audio",
      category: "txt2img",
    },);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.probe.ok,).toBe(false,);
    expect("row" in result,).toBe(false,);
  });

  it("keeps operator labels on idempotent re-ingest", () => {
    const first = ingestWorkflow({
      workflow: markedWorkflow(),
      workflowId: "v-0010",
      snapshot: snapshotOf(),
      expectedOutputKind: "video",
      category: "txt2img",
    },);

    if (!first.ok) {
      throw new Error(`expected green ingest: ${first.probe.errors.join("; ",)}`,);
    }

    const edited = first.payload.parameters.map((parameter,) => ({
      ...parameter,
      label: `Operator ${parameter.name}`,
    }));

    const second = ingestWorkflow({
      workflow: markedWorkflow(),
      workflowId: "v-0010",
      snapshot: snapshotOf(),
      expectedOutputKind: "video",
      category: "txt2img",
      existing: edited,
    },);

    if (!second.ok) {
      throw new Error(`expected green re-ingest: ${second.probe.errors.join("; ",)}`,);
    }

    expect(second.payload.parameters.map((parameter,) => parameter.label),)
      .toEqual(edited.map((parameter,) => parameter.label),);
  });

  it("rejects an API-format graph without converting it", () => {
    const first = ingestWorkflow({
      workflow: markedWorkflow(),
      workflowId: "v-0010",
      snapshot: snapshotOf(),
      expectedOutputKind: "video",
      category: "txt2img",
    },);

    if (!first.ok) {
      throw new Error(`expected green ingest: ${first.probe.errors.join("; ",)}`,);
    }

    expect(() =>
      ingestWorkflow({
        workflow: first.payload.body as unknown as UiWorkflow,
        workflowId: "v-0010",
        snapshot: snapshotOf(),
        expectedOutputKind: "video",
        category: "txt2img",
      },)
    ).toThrow(IngestError,);
  });
});
