// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * permission-policy.ts — the fail-closed auto-allow classifier for ACP
 * `session/request_permission` asks (TASK-permission-approval-flow).
 *
 * A harness ask is auto-allowed ONLY when both hold:
 *
 * 1. its ACP tool-call `kind` is in the static read-only allowlist
 *    (READ_ONLY_TOOL_KINDS), or has no filesystem surface at all
 *    (NO_FS_TOOL_KINDS — `think`);
 * 2. every string leaf carried by the request params resolves inside the
 *    ask's sandbox cwd (the session cwd), through `isWithinScope`'s
 *    realpath discipline, and at least one such candidate exists for
 *    filesystem kinds.
 *
 * Everything else — write/exec kinds, an unknown or missing kind, a path
 * escaping the sandbox, or a filesystem ask with no verifiable target —
 * requires human approval. There is no path where an unclassifiable ask is
 * auto-allowed: default-deny is the whole point of this module.
 *
 * The plugin system's `ToolPolicyTag` (src/plugins/tool-policy.ts) is the
 * declarative-tag pattern this module follows, but its only tag
 * (`requires-strict-codegen`) is a process requirement, not an effect
 * class — it maps no tool to "read-only", so the classification lives on
 * the closed ACP kind union plus this static allowlist instead of an
 * invented tag.
 *
 * @module harness-permission-policy
 */

import { isWithinScope, } from "../../harness/worktree-scope";

/** ACP tool-call kinds classified as reading the filesystem, not writing it. */
export const READ_ONLY_TOOL_KINDS = ["read", "search", "fetch",] as const;

/** ACP tool-call kinds with no filesystem surface at all. */
export const NO_FS_TOOL_KINDS = ["think",] as const;

/** Every ACP tool-call kind that is neither read-only nor fs-free. */
export const WRITE_OR_EXEC_TOOL_KINDS = ["edit", "delete", "move", "execute", "other",] as const;

/** Whether `kind` is a known ACP tool-call kind of any class. */
function isKnownKind(kind: string,): boolean {
  return (READ_ONLY_TOOL_KINDS as readonly string[]).includes(kind,) ||
    (NO_FS_TOOL_KINDS as readonly string[]).includes(kind,) ||
    (WRITE_OR_EXEC_TOOL_KINDS as readonly string[]).includes(kind,);
}

/** Whether `kind` is classified as mutating or executing. */
function isWriteOrExec(kind: string,): boolean {
  return (WRITE_OR_EXEC_TOOL_KINDS as readonly string[]).includes(kind,);
}

/** What the classifier decided — fail-closed means only these two shapes exist. */
export type PermissionPolicyVerdict =
  | { decision: "auto_allow"; reason: string }
  | { decision: "require_approval"; reason: string };

/** Inputs for {@link classifyPermission}. */
export interface ClassifyPermissionInput {
  /** Raw `session/request_permission` params, exactly as the harness sent them. */
  params: unknown;
  /** The tool-call kind the harness asked about; null when absent/unparsable. */
  kind: string | null;
  /** The sandbox cwd the ask's session runs in (the session/new cwd). */
  sandboxRoot: string;
}

/**
 * Shared depth-limited string walk underpinning both collectors below: one
 * recursion skeleton (array/object descent, truncation accounting) so the
 * two policies cannot drift apart.
 * @param value - raw JSON value
 * @param depth - remaining descent budget
 * @param underPathKey - whether a path-bearing key was seen above
 * @param pathKeyOnly - collect only leaves under a path-bearing key
 * @returns the collected string leaves plus whether any content was skipped.
 */
function walkStrings(
  value: unknown,
  depth: number,
  underPathKey: boolean,
  pathKeyOnly: boolean,
): { leaves: string[]; truncated: boolean } {
  if (typeof value === "string") {
    return { leaves: !pathKeyOnly || underPathKey ? [value,] : [], truncated: false, };
  }

  if (depth <= 0) { return { leaves: [], truncated: true, }; }
  if (Array.isArray(value,) || (value !== null && typeof value === "object")) {
    const entries = Array.isArray(value,)
      ? value.map((v,) => [null, v,] as const)
      : Object.entries(value,);

    const leaves: string[] = [];
    let truncated = false;
    for (const [key, v,] of entries) {
      const inner = walkStrings(
        v,
        depth - 1,
        underPathKey || (key !== null && PATH_KEY_PATTERN.test(key,)),
        pathKeyOnly,
      );

      leaves.push(...inner.leaves,);
      truncated = truncated || inner.truncated;
    }

    return { leaves, truncated, };
  }

  return { leaves: [], truncated: false, };
}

/** Key names whose string value is treated as a filesystem target. */
const PATH_KEY_PATTERN = /path|file|dir|glob|target/i;

/**
 * Path candidates: string leaves reached under a path-bearing key (the ACP
 * `toolCall.rawInput` shape), at any depth. Protocol strings (sessionId,
 * option labels) are NOT candidates — they cannot vouch for where the tool
 * acts — but they still take part in the escape check below.
 * @param value - raw JSON value
 * @param depth - remaining descent budget
 * @param underPathKey - whether a path-bearing key was seen above
 * @returns path candidates plus whether any content was skipped.
 */
function collectPathCandidates(
  value: unknown,
  depth: number,
  underPathKey: boolean,
): { leaves: string[]; truncated: boolean } {
  return walkStrings(value, depth, underPathKey, true,);
}

/**
 * Classify one permission ask. `read`/`search`/`fetch` auto-allow only when
 * the ask carries a path-bearing target (e.g. `toolCall.rawInput.path`) and
 * EVERY string leaf of the params — candidates and protocol strings alike —
 * stays inside `sandboxRoot`. A read-only ask with no verifiable target, a
 * path that escapes, or an over-deep payload requires approval. `think`
 * auto-allows outright; write/exec and unknown kinds always require
 * approval.
 * @param input - raw params, kind, and the sandbox root to check against
 * @returns the verdict; never throws.
 */
export async function classifyPermission(input: ClassifyPermissionInput,): Promise<PermissionPolicyVerdict> {
  const { params, kind, sandboxRoot, } = input;

  if (kind === null || !isKnownKind(kind,)) {
    return { decision: "require_approval", reason: `unknown or missing tool kind (${kind ?? "none"})`, };
  }

  if (isWriteOrExec(kind,)) {
    return { decision: "require_approval", reason: `write/exec tool kind "${kind}"`, };
  }

  if ((NO_FS_TOOL_KINDS as readonly string[]).includes(kind,)) {
    return { decision: "auto_allow", reason: `no-filesystem tool kind "${kind}"`, };
  }

  const strings = walkStrings(params, 6, true, false,);
  if (strings.truncated) {
    return { decision: "require_approval", reason: "params nest deeper than the walk budget — unverifiable", };
  }

  const candidates = collectPathCandidates(params, 6, false,);
  if (candidates.truncated || candidates.leaves.length === 0) {
    return {
      decision: "require_approval",
      reason: `read-only ask "${kind}" carries no verifiable path target`,
    };
  }

  // Defense in depth: a path smuggled into a non-path key (a prose title
  // that is really an absolute path) blocks the auto-allow too.
  for (const candidate of [...strings.leaves, ...candidates.leaves,]) {
    if (!await isWithinScope(sandboxRoot, candidate,)) {
      return { decision: "require_approval", reason: `path outside sandbox cwd: ${candidate}`, };
    }
  }

  return { decision: "auto_allow", reason: `read-only tool kind "${kind}" inside sandbox cwd`, };
}
