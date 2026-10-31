// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Probe test generator: `DeriveResult` → runnable `bun:test` source.
 *
 * Given the same row inputs `runAcceptanceProbe` takes, `generateProbeTest`
 * emits the source text of a self-contained test file that rebuilds the
 * derivation from the committed fixtures, runs the stubbed probe, and
 * asserts it green. The emitted file carries the parallel-safety contract
 * the ticket demands: an in-process fake (no listening socket), read-only
 * shared snapshots, per-test in-memory copies, nothing to tear down, green
 * alone / in any order / under the default parallel runner.
 *
 * The generator is a serializer, not a second implementation: the emitted
 * test calls the real `runAcceptanceProbe`, so generator and engine cannot
 * drift apart silently — a drift fails the emitted test, not a review.
 *
 * @module comfyui-params/probe-generate
 */
import { jsonStringifyOr, } from "../../utils";
import type { DeriveResult, } from "./types";

/** Row inputs for {@link generateProbeTest}. */
export interface GenerateProbeOptions {
  readonly workflowId: string;
  readonly fixtureFile: string;
  readonly markedNodeId: number;
  readonly snapshotFile: string;
  readonly expectedOutputKind: string;
  readonly derived: DeriveResult;
  /**
   * Absolute directory of this module (`import.meta.dir` at the call site).
   * The emission imports the engine by absolute path, so the emitted file
   * runs from any directory — including a per-test tmp dir.
   */
  readonly moduleDir: string;
}

/**
 * Serialize one derived parameter to its `TemplateParameter` literal.
 * @param parameter - A derived row parameter
 * @returns Source text evaluating to an equivalent parameter
 */
function serializeParameter(parameter: DeriveResult["parameters"][number],): string {
  const fields: string[] = [
    `name: ${jsonStringifyOr(parameter.name,)}`,
    `type: ${jsonStringifyOr(parameter.type,)}`,
    `label: ${jsonStringifyOr(parameter.label,)}`,
    `default: ${jsonStringifyOr(parameter.default ?? null,)}`,
  ];

  if (parameter.description !== undefined) {
    fields.push(`description: ${jsonStringifyOr(parameter.description,)}`,);
  }

  if (parameter.min !== undefined) { fields.push(`min: ${String(parameter.min,)}`,); }
  if (parameter.max !== undefined) { fields.push(`max: ${String(parameter.max,)}`,); }
  if (parameter.step !== undefined) { fields.push(`step: ${String(parameter.step,)}`,); }
  if (parameter.options !== undefined) {
    fields.push(`options: ${jsonStringifyOr(parameter.options,)}`,);
  }

  if (parameter.required !== undefined) {
    fields.push(`required: ${String(parameter.required,)}`,);
  }

  return `{ ${fields.join(", ",)} }`;
}

/**
 * Serialize the override map to its `Map` literal.
 * @param derived - Derived parameters plus the `{{var}}` override map
 * @returns Source text evaluating to an equivalent override map
 */
function serializeOverrides(derived: DeriveResult,): string {
  const entries = [...derived.overrides,].map(([nodeId, fields,],) => {
    const pairs = Object.entries(fields,)
      .map(([input, token,],) => `${jsonStringifyOr(input,)}: ${jsonStringifyOr(token,)}`)
      .join(", ",);

    return `[${jsonStringifyOr(nodeId,)}, { ${pairs} }] as const`;
  },);

  return `new Map<string, Readonly<Record<string, string>>>([${entries.join(", ",)}])`;
}

/**
 * Emit a runnable `bun:test` file for one derived workflow row.
 * @param options - Row id, fixture references, kind, and the derived result
 * @returns Test source text; write it to a `.test.ts` file and run `bun test`
 */
export function generateProbeTest(options: GenerateProbeOptions,): string {
  const { workflowId, fixtureFile, markedNodeId, snapshotFile, expectedOutputKind, derived, moduleDir, } = options;
  const parameters = derived.parameters.map((parameter,) => serializeParameter(parameter,)).join(",\n    ",);
  const overrides = serializeOverrides(derived,);
  return `// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generated acceptance probe for workflow row ${workflowId}.
 *
 * Emitted by \`generateProbeTest\` (src/generation/comfyui-params); do not
 * hand-edit — re-run the generator after re-derivation instead.
 *
 * Resource contract (parallel-safe): the stubbed ComfyUI is an in-process
 * fake — no listening socket, and no server at all on this path. Snapshot
 * fixtures are shared READ-ONLY; the derivation below rebuilds its graph
 * and parameters in memory per run, so each test owns its own copies.
 * Nothing is written to disk at all, teardown needs no afterEach (a failed
 * test leaks nothing), and each test passes alone, in any order, and under the default parallel runner
 * (\`bun test\` parallelizes files). Live probes (weights download, real
 * engine) are integration: serialized and marked — never in the
 * pre-commit verify gate.
 */
import { describe, expect, it, } from "bun:test";
import fs from "node:fs";
import { convertWorkflow, } from ${jsonStringifyOr(`${moduleDir}/../comfyui-converter/index`,)};
import type { ObjectInfoSnapshot, UiWorkflow, } from ${jsonStringifyOr(`${moduleDir}/../comfyui-converter/types`,)};
import { deriveParameters, } from ${jsonStringifyOr(`${moduleDir}/derive`,)};
import { runAcceptanceProbe, } from ${jsonStringifyOr(`${moduleDir}/probe`,)};

describe("generated probe ${workflowId}", () => {
  it("runs the stubbed probe green", () => {
    const raw = JSON.parse(fs.readFileSync(${jsonStringifyOr(fixtureFile,)}, "utf8",),) as UiWorkflow;
    const workflow: UiWorkflow = {
      ...raw,
      nodes: (raw.nodes ?? []).map((node,) =>
        node.id === ${String(markedNodeId,)} ? { ...node, title: "[p] Settings", } : node),
    };
    const snapshot = JSON.parse(fs.readFileSync(${jsonStringifyOr(snapshotFile,)}, "utf8",),) as ObjectInfoSnapshot;
    const graph = convertWorkflow(workflow, snapshot,).graph;
    const derived = deriveParameters({ workflow, converted: graph, workflowId: ${
    jsonStringifyOr(workflowId,)
  }, snapshot, },);
    const expectedParameters = [\n    ${parameters},\n    ];
    expect(derived.parameters.map((parameter,) => parameter.name).toSorted(),)
      .toEqual(expectedParameters.map((parameter,) => parameter.name).toSorted(),);
    expect([...derived.overrides,]).toEqual([...(${overrides}),]);
    const result = runAcceptanceProbe({
      workflowId: ${jsonStringifyOr(workflowId,)},
      graph,
      derived,
      snapshot,
      expectedOutputKind: ${jsonStringifyOr(expectedOutputKind,)},
    },);
    expect(result.errors,).toEqual([],);
    expect(result.ok,).toBe(true,);
  });
});
`;
}
