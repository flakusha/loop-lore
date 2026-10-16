// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Probe spawned by `tool-policy.test.ts` as a real Bun process, with and
 * without `--disallow-code-generation-from-strings=strict`. Emits one JSON
 * line describing what the policy gate and the runtime actually did.
 *
 * Everything here is EXECUTED, not read off Bun's documentation: the whole
 * claim of the `requires-strict-codegen` tag is that specific escape hatches
 * close, so a test asserting that claim from prose would assert nothing. The
 * scenario is chosen by argv so the test controls whether the process carries
 * the flag, rather than inheriting whatever the suite was launched with.
 *
 * @module plugin-strict-probe-fixture
 */

import * as vm from "node:vm";
import { jsonStringifyOr, } from "../utils";
import { executePluginTool, } from "./tool-executor";
import { ToolPolicyError, assertToolPolicySatisfied, isStrictCodegenActive, } from "./tool-policy";
import type { ToolDefinition, ToolResult, } from "./types";

/** A `data:` URL assembled at run time. A literal resolves at parse time. */
const runtimeDataUrl = ["data:text/javascript", "export default 1"].join(",");

const taggedTool: ToolDefinition = {
  name: "probe-tagged",
  description: "tool tagged requires-strict-codegen",
  parameters: {},
  policy: "requires-strict-codegen",
  handler: () => ({ content: "ran", }),
};

const untaggedTool: ToolDefinition = {
  name: "probe-untagged",
  description: "tool with no policy tag",
  parameters: {},
  handler: () => ({ content: "ran", }),
};

/**
 * Run one escape attempt and report what the runtime did with it.
 * @param run - The escape to attempt.
 */
const attempt = (run: () => unknown): "allowed" | "refused" => {
  try {
    run();
    return "allowed";
  } catch {
    return "refused";
  }
};

/**
 * A dynamic import resolves allowed, rejects refused.
 * @param specifier - The module specifier to import.
 */
const importOutcome = (specifier: string,): Promise<"allowed" | "refused"> => {
  return import(specifier).then(
    () => "allowed" as const,
    () => "refused" as const,
  );
};

/**
 * The typed refusal, reduced to the fields the test asserts on.
 * @param tool - The tool to gate.
 */
function describeRefusal(tool: ToolDefinition,): Record<string, unknown> | null {
  try {
    assertToolPolicySatisfied(tool,);
    return null;
  } catch (error) {
    if (!(error instanceof ToolPolicyError)) { return { unexpected: String(error), }; }
    return { name: error.name, toolName: error.toolName, tag: error.tag, missingFlag: error.missingFlag, };
  }
}

/** Tagged tool refused or run, plus the typed error it refused with. */
const scenarioGate = async (): Promise<Record<string, unknown>> => ({
  tagged: await executePluginTool(taggedTool, {},),
  untagged: await executePluginTool(untaggedTool, {},),
  refusal: describeRefusal(taggedTool,),
});

/** An untagged tool whose handler invokes the tagged tool. */
const scenarioNested = async (): Promise<Record<string, unknown>> => {
  const inner: ToolResult = await executePluginTool(taggedTool, {},);
  const outer = await executePluginTool({
    name: "probe-outer",
    description: "invokes the tagged tool from its handler",
    parameters: {},
    handler: () => inner,
  }, {});

  return { inner, outer, };
};

/** A tool that gains its tag only after a first, ungated invocation. */
const scenarioMutate = async (): Promise<Record<string, unknown>> => {
  const tool: ToolDefinition = { ...untaggedTool, name: "probe-mutated", };
  const before = await executePluginTool(tool, {},);
  tool.policy = "requires-strict-codegen";
  const after = await executePluginTool(tool, {},);

  return { before, after, };
};

/** Which string-to-code escapes this runtime actually refuses. */
const scenarioCoverage = async (): Promise<Record<string, unknown>> => ({
  eval: attempt(() => globalThis.eval("1+1")),
  newFunction: attempt(() => new Function("return 1")()),
  vmScript: attempt(() => new vm.Script("1+1")),
  dataUrlImport: await importOutcome(runtimeDataUrl),
});

const scenarios: Record<string, () => Promise<Record<string, unknown>> | Record<string, unknown>> = {
  coverage: scenarioCoverage,
  gate: scenarioGate,
  mutate: scenarioMutate,
  nested: scenarioNested,
};

const scenario = process.argv[2] ?? "gate";
const run = scenarios[scenario];
if (!run) {
  process.stderr.write(`unknown scenario: ${scenario}\n`);
  process.exit(2);
}

process.stdout.write(
  `${jsonStringifyOr({ scenario, strictActive: isStrictCodegenActive(), result: await run(), },)}\n`,
);