// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generated plan-artifact guard — one gate over every artifact
 * `.plan/artifact-spec.md` declares generated. Each artifact already owns a
 * regenerate-and-diff `--check` (giwt's or ours); this script runs them all
 * and fails when any generated file drifts from its sources. Faster than
 * re-reading every artifact here, and it cannot disagree with the
 * per-artifact gates: it literally runs them.
 *
 * Usage:
 *   bun run scripts/check-plan-artifacts.ts --check   # fail on drift
 */

export interface Artifact {
  /** Human name, used in report lines. */
  name: string;
  /** Repo-relative generated file the check verifies. */
  file: string;
  /** Command whose exit 0 means fresh (regenerate-and-diff). */
  check: string[];
}

export interface ArtifactResult extends Artifact {
  ok: boolean;
  detail: string;
}

/** The generated set — mirrors `.plan/artifact-spec.md`; extend both. */
export const ARTIFACTS: Artifact[] = [
  { name: "code-map", file: ".plan/code-map.json", check: ["bun", "run", "plan:map:check",], },
  { name: "feature-matrix", file: ".plan/feature-matrix.md", check: ["bun", "run", "plan:matrix:check",], },
  { name: "priority-matrix", file: ".plan/priority-matrix.md", check: ["bun", "run", "plan:priority:check",], },
  { name: "entry-map", file: ".plan/entry-map.md", check: ["bun", "run", "plan:entry-map:check",], },
  {
    name: "interconnect",
    file: ".plan/interconnect.json + .plan/interconnect.md",
    check: ["bun", "run", "plan:links:check",],
  },
  { name: "epics-index", file: ".plan/epics-index.md", check: ["bun", "run", "plan:docs:check",], },
];

export type Runner = (check: string[],) => { exit: number; detail: string };

/** Run every artifact check through `run`; pure apart from the runner. */
export function checkAll(artifacts: readonly Artifact[], run: Runner,): ArtifactResult[] {
  return artifacts.map((artifact,) => {
    let outcome: { exit: number; detail: string };
    try {
      outcome = run(artifact.check,);
    } catch (error) {
      return { ...artifact, ok: false, detail: String(error,), };
    }
    return { ...artifact, ok: outcome.exit === 0, detail: outcome.detail, };
  },);
}

/** Report lines and exit code for results — pure, tested. */
export function verdict(results: readonly ArtifactResult[],): { lines: string[]; exitCode: number } {
  const failed = results.filter((r,) => !r.ok);
  const lines = results.map((r,) =>
    `${r.ok ? "ok" : "STALE"} ${r.name} (${r.file})${r.ok ? "" : ` — ${r.detail}`} → ${r.check.join(" ",)}`
  );
  return { lines, exitCode: failed.length > 0 ? 1 : 0, };
}

function bunRunner(check: string[],): { exit: number; detail: string } {
  const proc = Bun.spawnSync(check, { stdout: "pipe", stderr: "pipe", },);
  const err = proc.stderr.toString().trim().split("\n",)[0] ?? "";
  // SyncSubprocess reports the code as exitCode (`.exit` is a node-ism and
  // reads undefined here, which would fail every artifact as STALE).
  return { exit: proc.exitCode ?? 1, detail: err.slice(0, 160,), };
}

function main(): void {
  const check = process.argv.includes("--check",);
  const report = verdict(checkAll(ARTIFACTS, bunRunner,),);
  for (const line of report.lines) {
    if (line.startsWith("ok ",)) { console.log(line,); }
    else { console.error(line,); }
  }
  process.exit(check ? report.exitCode : 0,);
}

if (import.meta.main) { main(); }
