// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Worktree scope guard for harness plugin tools.
 *
 * Plugin tools run in-process with full filesystem access; nothing about the
 * plugin loader isolates them (see `src/plugins/tool-policy.ts` for the same
 * honest framing). What this module adds is a *confinement contract* for the
 * path-bearing arguments a tool receives: every such argument is resolved
 * against the harness worktree root and verified — through `fs.realpath` on
 * both sides — to actually land inside it. A symlink that points outside, or
 * a `../` traversal, is rejected rather than silently honoured.
 *
 * Cross-scope access is never silently denied to a caller that asked for it:
 * a tool context carrying `requestRootChange: true` opts into escalation, and
 * every escalation is written to the structured logger.
 *
 * @module worktree-scope
 */
import { realpath, } from "node:fs/promises";
import { resolve, sep, } from "node:path";
import { getChildLogger, type Logger, } from "../logger";

/** Parameter keys whose string values are treated as filesystem paths. */
const PATH_PARAM_KEYS: Record<string, true> = {
  path: true,
  file: true,
  filepath: true,
  file_path: true,
  filename: true,
  file_name: true,
  dir: true,
  directory: true,
  dirname: true,
  dir_path: true,
};

/**
 * A path argument resolves outside the harness worktree root and the call did
 * not escalate. Carries both paths so the refusal names what was refused.
 */
export class PathOutsideScopeError extends Error {
  /** The scope root the path was checked against. */
  readonly root: string;
  /** The rejected path (already resolved against the root). */
  readonly target: string;

  /**
   * @param root - Scope root the path was checked against.
   * @param target - Rejected resolved path.
   */
  constructor(root: string, target: string,) {
    super(
      `Path "${target}" resolves outside the worktree scope root "${root}" — pass requestRootChange: true to escalate explicitly`,
    );

    this.name = "PathOutsideScopeError";
    this.root = root;
    this.target = target;
  }
}

/**
 * Resolve `target` against `root` and verify it stays inside the root after
 * symlink resolution on both sides. A `../` traversal and a symlink escaping
 * the root both throw; a symlink that stays inside is accepted.
 *
 * A target whose final component does not exist yet (the common create case)
 * falls back to a lexical containment check against the real root, so a
 * not-yet-written path is judged on its spelling rather than failing outright.
 * @param root - Scope root (an existing directory).
 * @param target - Path to resolve; absolute or relative to the root.
 * @returns The realpath'd target path, for callers that want to use it.
 * @throws {PathOutsideScopeError} When the real target escapes the real root.
 */
export async function resolveWithinScope(root: string, target: string,): Promise<string> {
  const joined = resolve(root, target,);
  const realRoot = await realpath(root,);
  const realTarget = await realpath(joined,).catch((): string | null => null);

  if (realTarget !== null) {
    assertInside(realRoot, realTarget,);
    return realTarget;
  }

  assertInside(realRoot, joined,);
  return joined;
}

/**
 * Boolean convenience around {@link resolveWithinScope}.
 * @param root - Scope root.
 * @param target - Path to check.
 * @returns True when the target is (or lexically resolves) inside the root.
 */
export async function isWithinScope(root: string, target: string,): Promise<boolean> {
  try {
    await resolveWithinScope(root, target,);
    return true;
  } catch {
    return false;
  }
}

/** Throw unless `target` equals `root` or lives underneath it.
 * @throws {PathOutsideScopeError} When the target escapes the root.
 */
function assertInside(root: string, target: string,): void {
  if (target === root || target.startsWith(`${root}${sep}`,)) { return; }
  throw new PathOutsideScopeError(root, target,);
}

/** Inputs for {@link assertParamsWithinScope}. */
export interface ScopeGuardInput {
  /** Tool name, for the escalation log line. */
  toolName: string;
  /** Handler parameters; only path-named string values are inspected. */
  params: Record<string, unknown>;
  /** Scope root. Defaults to the harness process working directory. */
  root?: string;
  /** Explicit escalation: allow outside-scope paths and log the crossing. */
  requestRootChange?: boolean;
}

/**
 * Guard every path-bearing parameter of one tool invocation. Non-path
 * arguments (and path-named non-string values) are untouched.
 * @param input - see {@link ScopeGuardInput}.
 * @throws {PathOutsideScopeError} When a path escapes the scope and the call
 *   did not set `requestRootChange`.
 */
export async function assertParamsWithinScope(input: ScopeGuardInput,): Promise<void> {
  const root = input.root ?? process.cwd();
  for (const [key, value,] of Object.entries(input.params,)) {
    if (PATH_PARAM_KEYS[key.toLowerCase()] !== true || typeof value !== "string") { continue; }
    try {
      await resolveWithinScope(root, value,);
    } catch (error) {
      if (input.requestRootChange === true) {
        logEscalation(input.toolName, key, value,);
        continue;
      }

      throw error;
    }
  }
}

/** One structured warn per escalated path. Never console — the app logger. */
function logEscalation(toolName: string, key: string, value: string,): void {
  const log = logSource();
  log?.warn("tool escalated outside worktree scope via requestRootChange", {
    tool: toolName,
    param: key,
    path: value,
    root: process.cwd(),
  },);
}

/**
 * Logger source for escalation lines. Memoized child by default; a test seam
 * because `getChildLogger` children snapshot their transports at creation, so
 * a transport added to the root mid-suite never sees a pre-existing child's
 * entries.
 */
let logSource: () => Logger | null = () => getChildLogger("harness/worktree-scope",);

/**
 * Replace the escalation logger source. Test-only seam.
 * @param source - Replacement source, or null-returning to silence.
 */
export function setScopeLogSourceForTests(source: () => Logger | null,): void {
  logSource = source;
}
