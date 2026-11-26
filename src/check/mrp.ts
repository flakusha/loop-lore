// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Merge-Readiness Pack (MRP): deterministic evidence wrapper over the JSON
 * report `bun run check` already writes. Only facts present in the report are
 * asserted; axes without an input are explicitly unavailable.
 */

// oxlint-disable-next-line import/no-nodejs-modules
import { createHash, } from "node:crypto";

import { canonicalJSON, } from "../hash/record-hash";

/** One gate entry from `.tmp/check-report.json`. */
export interface CheckReportCheck {
  name: string;
  command: string;
  passed: boolean;
  skipped?: boolean;
  advisory?: boolean;
  timedOut?: boolean;
  exitCode?: number | null;
  durationMs?: number;
  output?: string | null;
  truncated?: boolean;
}

/** The subset of the check report the MRP consumes. */
export interface CheckReport {
  schemaVersion?: number;
  generatedAt?: string;
  runId?: string;
  branch?: string;
  gitHead?: string;
  gitDirty?: boolean;
  passed?: boolean;
  exitCode?: number;
  summary?: {
    total?: number;
    passed?: number;
    skipped?: number;
    advisory?: number;
    failed?: number;
    durationMs?: number;
  };
  checks?: CheckReportCheck[];
}

/** One evidence axis. `unavailable` always carries the reason. */
export interface MrpAxis {
  status: "ok" | "unavailable";
  evidence: string;
  reason: string | null;
}

/** Deterministic merge-readiness artifact. */
export interface Mrp {
  schemaVersion: 1;
  kind: "merge-readiness-pack";
  hash: string;
  verdict: "ready" | "ready-with-caveats" | "blocked";
  provenance: {
    runId: string | null;
    gitHead: string | null;
    branch: string | null;
    generatedAt: string | null;
    gitDirty: boolean;
  };
  summary: {
    total: number;
    passed: number;
    skipped: number;
    advisory: number;
    failed: number;
    durationMs: number;
  };
  axes: {
    completeness: MrpAxis;
    verification: MrpAxis;
    hygiene: MrpAxis;
    rationale: MrpAxis;
    accountability: MrpAxis;
  };
  unavailable: string[];
  blockingFailures: string[];
  advisoryFailures: string[];
}

/**
 * Build an MRP from a check report. Advisory failures are caveats, not
 * blockers; skipped gates and a dirty tree are caveats too.
 * @param report - parsed `.tmp/check-report.json`
 * @returns deterministic MRP with a sha256 over every other field
 */
export function buildMrp(report: CheckReport,): Mrp {
  const checks = report.checks ?? [];
  const summary = report.summary ?? {};
  const total = summary.total ?? 0;
  const passed = summary.passed ?? 0;
  const skipped = summary.skipped ?? 0;
  const advisory = summary.advisory ?? 0;
  const failed = summary.failed ?? 0;
  const blockingFailures = checks
    .filter((c,) => !c.skipped && !c.advisory && (c.exitCode ?? 0) !== 0)
    .map((c,) => c.name);

  const advisoryFailures = checks
    .filter((c,) => !c.skipped && c.advisory === true && (c.exitCode ?? 0) !== 0)
    .map((c,) => c.name);

  const timedOut = checks.filter((c,) => c.timedOut === true).map((c,) => c.name);
  const dirty = report.gitDirty === true;

  const verdict: Mrp["verdict"] = blockingFailures.length > 0 || timedOut.length > 0
    ? "blocked"
    : advisoryFailures.length > 0 || skipped > 0 || dirty
    ? "ready-with-caveats"
    : "ready";

  const unavailable: string[] = [];
  const unavailableAxis = (name: string, reason: string,): MrpAxis => {
    unavailable.push(name,);
    return { evidence: "", reason, status: "unavailable", };
  };

  const axes: Mrp["axes"] = {
    accountability: report.runId || report.gitHead
      ? {
        evidence: `run ${report.runId ?? "unknown"} @ ${report.gitHead ?? "unknown"}${dirty ? " (dirty tree)" : ""}`,
        reason: null,
        status: "ok",
      }
      : unavailableAxis("accountability", "report has no runId or gitHead",),
    completeness: total > 0
      ? {
        evidence: `${passed}/${total} gates passed; ${skipped} skipped, ${advisory} advisory, ${failed} failed`,
        reason: null,
        status: "ok",
      }
      : unavailableAxis("completeness", "report has no gate summary",),
    hygiene: unavailableAxis("hygiene", "check report records gate outcomes, not lint or style findings",),
    rationale: unavailableAxis("rationale", "check report carries no linked briefing or ticket hash",),
    verification: checks.length > 0
      ? {
        evidence:
          `blocking ${blockingFailures.length}, advisory ${advisoryFailures.length}, timeout ${timedOut.length}`,
        reason: null,
        status: "ok",
      }
      : unavailableAxis("verification", "report has no per-check entries",),
  };

  const withoutHash = {
    axes,
    blockingFailures,
    summary: {
      advisory,
      durationMs: summary.durationMs ?? 0,
      failed,
      passed,
      skipped,
      total,
    },
    unavailable,
    verdict,
    advisoryFailures,
    kind: "merge-readiness-pack",
    provenance: {
      branch: report.branch ?? null,
      generatedAt: report.generatedAt ?? null,
      gitDirty: dirty,
      gitHead: report.gitHead ?? null,
      runId: report.runId ?? null,
    },
    schemaVersion: 1,
  } as const;

  const hash = createHash("sha256",)
    .update(canonicalJSON(withoutHash,), "utf8",)
    .digest("hex",);

  return { ...withoutHash, hash, };
}
