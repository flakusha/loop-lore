// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin tool policy tags — a process requirement, NOT isolation.
 *
 * Plugin tools run in-process (`src/plugins/loader.ts` `await import()`s them
 * into the server), so there is no filesystem or network boundary here and
 * this module must never be described as one. The single control it enforces
 * is that the process was started with Bun's
 * `--disallow-code-generation-from-strings=strict`, which refuses the
 * string-to-code escape (`eval`, `new Function`, `node:vm`, runtime `data:`
 * imports) for the whole process, Workers included.
 *
 * The check runs on every invocation and is never cached, so a tool registered
 * before its tag was known is still gated, and a tool that gains a tag after a
 * first invocation cannot keep that first decision.
 *
 * Stronger isolation is future work: `Bun.ModuleGraph` gives memory isolation
 * without request routing but is experimental and states plainly that it is
 * not a security sandbox.
 *
 * @module plugin-tool-policy
 */

/** Bun flag that turns off string-to-code for the whole process. */
export const STRICT_CODEGEN_FLAG = "--disallow-code-generation-from-strings=strict";

/**
 * The claim a `requires-strict-codegen` tag makes, verbatim. Pinned by test:
 * it names the flag and promises nothing about isolation.
 */
export const STRICT_CODEGEN_CLAIM = `requires Bun ${STRICT_CODEGEN_FLAG}`;

/** Requirements a plugin tool may declare. Adding one is a security change. */
export type ToolPolicyTag = "requires-strict-codegen";

/** Inputs for {@link isStrictCodegenActive}. */
export interface StrictCodegenOptions {
  /** Defaults to this process's own argv. A test seam: an argv from another runtime. */
  execArgv?: readonly string[];
}

/**
 * Whether this process refuses string-to-code, per `process.execArgv`.
 *
 * Bun reads the flag at startup and no API lowers it afterwards, so the argv
 * is the whole of the observable state. A runtime that does not know the flag
 * can never list it, and is therefore never treated as satisfying it.
 * @param options - see {@link StrictCodegenOptions}
 * @returns True only when the exact `=strict` spelling is present.
 */
export function isStrictCodegenActive(options: StrictCodegenOptions = {},): boolean {
  const argv = options.execArgv ?? process.execArgv;
  return argv.includes(STRICT_CODEGEN_FLAG);
}

/**
 * A tool declared a policy tag this process does not satisfy. Carries the tag
 * and the flag that would satisfy it, so the refusal names what is missing
 * instead of asserting an isolation boundary that does not exist.
 */
export class ToolPolicyError extends Error {
  /** The tool that was refused. */
  readonly toolName: string;
  /** The tag the tool declared. */
  readonly tag: ToolPolicyTag;
  /** The flag whose absence caused the refusal. */
  readonly missingFlag: string;

  /**
   * @param toolName - Refused tool's name.
   * @param tag - Tag the tool declared.
   */
  constructor(toolName: string, tag: ToolPolicyTag,) {
    super(`Tool "${toolName}" ${STRICT_CODEGEN_CLAIM}, but this process was not started with ${STRICT_CODEGEN_FLAG}`);
    this.name = "ToolPolicyError";
    this.toolName = toolName;
    this.tag = tag;
    this.missingFlag = STRICT_CODEGEN_FLAG;
  }
}

/** Inputs for {@link assertToolPolicySatisfied}. */
export interface ToolPolicySubject {
  name: string;
  policy?: ToolPolicyTag;
}

/**
 * Gate one invocation. Called at invocation time by `executePluginTool`.
 * @param tool - The tool about to run.
 * @throws {ToolPolicyError} When a declared tag is unsatisfied by this process.
 */
export function assertToolPolicySatisfied(tool: ToolPolicySubject,): void {
  if (tool.policy === "requires-strict-codegen" && !isStrictCodegenActive()) {
    throw new ToolPolicyError(tool.name, tool.policy,);
  }
}
