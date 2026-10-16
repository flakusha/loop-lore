// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `ToolDefinition.policy` — the `requires-strict-codegen` tag.
 *
 * The gate is exercised twice over: in-process for the pure decision
 * (`isStrictCodegenActive`) and as a real spawned Bun process, because "the
 * flag was passed" is only meaningful if the runtime really refuses what the
 * tag promises it refuses. `=strict`'s coverage is therefore EXECUTED (eval,
 * `new Function`, `node:vm`, run-time `data:` import) rather than asserted
 * from documentation.
 *
 * @module plugin-tool-policy-test
 */

import { describe, expect, test, } from "bun:test";
import {
  STRICT_CODEGEN_CLAIM,
  STRICT_CODEGEN_FLAG,
  ToolPolicyError,
  assertToolPolicySatisfied,
  isStrictCodegenActive,
} from "./tool-policy";
import { safeJsonParse, } from "../utils";

const FIXTURE = new URL("strict-probe.fixture.ts", import.meta.url).pathname;

/** A tool result as the probe reported it over the process boundary. */
interface ProbeToolResult {
  content: string;
  isError?: boolean;
}

/** Result of the `gate` scenario. */
interface GateResult {
  tagged: ProbeToolResult;
  untagged: ProbeToolResult;
  refusal: Record<string, string> | null;
}

/** Result of the `nested` scenario. */
interface NestedResult {
  inner: ProbeToolResult;
  outer: ProbeToolResult;
}

/** Result of the `mutate` scenario. */
interface MutateResult {
  before: ProbeToolResult;
  after: ProbeToolResult;
}

/** Result of the `coverage` scenario: one escape per string-to-code route. */
interface CoverageResult {
  eval: string;
  newFunction: string;
  vmScript: string;
  dataUrlImport: string;
}

/** What one probe run reported about its own process. */
interface ProbeEnvelope {
  strictActive: boolean;
  result: unknown;
}

/**
 * Run the probe fixture in a real Bun process and parse its one JSON line.
 * @param scenario - Which probe scenario to run.
 * @param strict - Start the process with the `=strict` flag.
 * @returns The scenario payload, typed by the caller.
 */
function probe<T>(scenario: string, strict: boolean,): T {
  const flags = strict ? [STRICT_CODEGEN_FLAG] : [];
  const proc = Bun.spawnSync({
    cmd: [process.execPath, ...flags, FIXTURE, scenario,],
    stdout: "pipe",
    stderr: "pipe",
  },);

  const stderr = proc.stderr.toString();
  expect({ exitCode: proc.exitCode, stderr, },).toEqual({ exitCode: 0, stderr: "", },);

  // Subprocess stdout is outside this process's control, so it is parsed at
  // the boundary rather than trusted.
  const parsed = safeJsonParse<ProbeEnvelope>(proc.stdout.toString(),);
  if (!parsed.ok) { throw new Error(`probe emitted unparseable output: ${parsed.error.message}`); }

  expect(parsed.value.strictActive,).toBe(strict);
  return parsed.value.result as T;
}

describe("isStrictCodegenActive", () => {
  test("the flag satisfies it; its absence, a prefix of it, and a bare spelling do not", () => {
    expect(isStrictCodegenActive({ execArgv: [STRICT_CODEGEN_FLAG,], },)).toBe(true,);
    // An older Bun that predates the flag can only ever lack it, so it must
    // never be read as satisfying the policy.
    expect(isStrictCodegenActive({ execArgv: [], },)).toBe(false,);
    expect(isStrictCodegenActive({ execArgv: ["--strict",], },)).toBe(false,);
    // The bare Node-compatible spelling refuses eval but leaves node:vm open,
    // so accepting it would promise less than the tag does.
    expect(isStrictCodegenActive({ execArgv: ["--disallow-code-generation-from-strings",], },)).toBe(false,);
  });

  test("defaults to this process's own argv", () => {
    // `bun test` does not pass the flag; the point is that the default reads
    // the live process rather than a captured snapshot.
    expect(isStrictCodegenActive(),).toBe(process.execArgv.includes(STRICT_CODEGEN_FLAG),);
  });
});

describe("the documented claim", () => {
  test("names the flag and promises no isolation", () => {
    expect(STRICT_CODEGEN_CLAIM,).toBe(`requires Bun ${STRICT_CODEGEN_FLAG}`,);
    const words = STRICT_CODEGEN_CLAIM.toLowerCase();
    expect(words,).not.toContain("sandbox",);
    expect(words,).not.toContain("isolat",);
    expect(words,).not.toContain("safe",);
  });
});

describe("assertToolPolicySatisfied", () => {
  test("an untagged tool passes without consulting the runtime", () => {
    expect(assertToolPolicySatisfied({ name: "plain", },)).toBeUndefined();
  });

  test("a tagged tool throws a ToolPolicyError naming the flag, when the process lacks it", () => {
    expect(isStrictCodegenActive(),).toBe(false);

    let thrown: unknown;
    try {
      assertToolPolicySatisfied({ name: "gated", policy: "requires-strict-codegen", },);
    } catch (error) {
      thrown = error;
    }

    expect(thrown,).toBeInstanceOf(ToolPolicyError,);
    if (!(thrown instanceof ToolPolicyError)) { return; }

    expect(thrown.missingFlag,).toBe(STRICT_CODEGEN_FLAG,);
    expect(thrown.tag,).toBe("requires-strict-codegen",);
    expect(thrown.toolName,).toBe("gated",);
    expect(thrown.message,).toContain(STRICT_CODEGEN_FLAG,);
  });
});

describe("the gate, without =strict", () => {
  test("refuses a tagged tool with a typed error naming the missing flag", () => {
    const result = probe<GateResult>("gate", false,);

    expect(result.tagged,).toEqual({
      content: JSON.stringify({
        error:
          `Tool "probe-tagged" ${STRICT_CODEGEN_CLAIM}, but this process was not started with ${STRICT_CODEGEN_FLAG}`,
      },),
      isError: true,
    },);

    expect(result.refusal,).toEqual({
      name: "ToolPolicyError",
      toolName: "probe-tagged",
      tag: "requires-strict-codegen",
      missingFlag: STRICT_CODEGEN_FLAG,
    },);
  });

  test("an untagged tool is unaffected", () => {
    expect(probe<GateResult>("gate", false,).untagged,).toEqual({ content: "ran", },);
  });

  test("a tagged tool reached from another tool's handler is refused too", () => {
    const { inner, outer, } = probe<NestedResult>("nested", false,);

    expect(inner.isError,).toBe(true,);
    expect(inner.content,).toContain(STRICT_CODEGEN_FLAG,);
    // The outer handler returns the refusal verbatim, so nesting neither
    // bypasses the gate nor launders the result into a success.
    expect(outer,).toEqual(inner,);
  });
});

describe("the gate, with =strict", () => {
  test("accepts the same tagged tool", () => {
    const result = probe<GateResult>("gate", true,);

    expect(result.tagged,).toEqual({ content: "ran", },);
    expect(result.untagged,).toEqual({ content: "ran", },);
    expect(result.refusal,).toBeNull();
  });
});

describe("=strict coverage, executed", () => {
  test("without the flag every string-to-code escape is open", () => {
    expect(probe<CoverageResult>("coverage", false,),).toEqual({
      eval: "allowed",
      newFunction: "allowed",
      vmScript: "allowed",
      dataUrlImport: "allowed",
    },);
  });

  test("with the flag every string-to-code escape is refused", () => {
    expect(probe<CoverageResult>("coverage", true,),).toEqual({
      eval: "refused",
      newFunction: "refused",
      vmScript: "refused",
      dataUrlImport: "refused",
    },);
  });

  test("the bare Node-compatible flag is refused by the gate, because it leaves node:vm open", () => {
    // Executed, not assumed: with the bare spelling the runtime refuses eval
    // but still runs a `new vm.Script`, so accepting it would overstate the tag.
    const bare = Bun.spawnSync({
      cmd: [process.execPath, "--disallow-code-generation-from-strings", FIXTURE, "coverage",],
      stdout: "pipe",
      stderr: "pipe",
    },);

    const parsed = safeJsonParse<ProbeEnvelope>(bare.stdout.toString(),);

    expect(bare.exitCode,).toBe(0,);
    expect(parsed.ok,).toBe(true,);
    if (!parsed.ok) { return; }

    expect(parsed.value.strictActive,).toBe(false,);
    expect(parsed.value.result,).toMatchObject({ eval: "refused", vmScript: "allowed", },);
  });
});

describe("no cached decision", () => {
  test("a tool that gains a tag after an ungated invocation is refused on the next one", () => {
    const { before, after, } = probe<MutateResult>("mutate", false,);

    // Ran first, then refused: the gate is re-evaluated per invocation, so the
    // first pass leaves nothing behind for the second to reuse.
    expect(before,).toEqual({ content: "ran", },);
    expect(after.isError,).toBe(true,);
    expect(after.content,).toContain("probe-mutated",);
  });
});