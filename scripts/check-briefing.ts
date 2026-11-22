// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * BriefingScript ticket-quality gate.
 *
 * Batch mode scores every `.plan/tickets/*.md` (minus index, help and BUG
 * tickets); a positional ticket path or slug scores one ticket. Pass
 * `--diff-base <ref>` (or BRIEFING_DIFF_BASE) to scan only tickets changed
 * versus that ref. Table output is bounded to 20 rows plus a summary line.
 * Gate mode comes from BRIEFING_GATE: off (table only), warn (default), fail
 * (reject scores exit 1). The scorer itself is src/plan/briefing-linter.ts.
 *
 * Usage:
 *   bun run scripts/check-briefing.ts
 *   bun run scripts/check-briefing.ts TASK-test-untested-routes
 *   bun run scripts/check-briefing.ts --diff-base dev
 *   BRIEFING_GATE=fail bun run scripts/check-briefing.ts
 */

import { readdirSync, readFileSync, } from "node:fs";
import { basename, relative, resolve, } from "node:path";
import { argument, object, option, optional, runScript, string, } from "../src/cli/parser";
import { type BriefingVerdict, lintBriefing, } from "../src/plan/briefing-linter";

const ROOT = resolve(import.meta.dir, "..",);
const TICKETS_DIR = resolve(ROOT, ".plan/tickets",);

export type BriefingGate = "off" | "warn" | "fail";

export interface TicketScore {
  file: string;
  score: number;
  verdict: BriefingVerdict;
  suggestions: string[];
}

/** True for markdown tickets the gate scores (index, help and BUG are skipped). */
export function isScannableTicket(name: string,): boolean {
  return name.endsWith(".md",) &&
    !name.startsWith("BUG-",) &&
    !name.toLowerCase().includes("help",) &&
    name !== "index.json";
}

/**
 * Resolve the gate mode from the environment.
 * @throws Error when BRIEFING_GATE is set to an unknown value.
 */
export function resolveGate(value: string | undefined,): BriefingGate {
  if (value === undefined || value === "") { return "warn"; }
  if (value === "off" || value === "warn" || value === "fail") { return value; }
  throw new Error(`BRIEFING_GATE must be off|warn|fail, got: ${value}`,);
}

/** Ticket paths in a directory, sorted by name so the table stays stable. */
export function listTickets(dir: string,): string[] {
  return readdirSync(dir,).filter(isScannableTicket,).sort().map((name,) => resolve(dir, name,));
}

/** Accept a path or a bare ticket slug (resolved inside ticketsDir). */
export function resolveTicketPath(value: string, ticketsDir: string = TICKETS_DIR,): string {
  return value.endsWith(".md",) ? resolve(value,) : resolve(ticketsDir, `${value}.md`,);
}

/** Score one ticket file; BUG filenames exempt the strategy axis. */
export function scoreTicketFile(path: string,): TicketScore {
  const name = basename(path,);
  const result = lintBriefing(readFileSync(path, "utf8",), {
    kind: name.startsWith("BUG-",) ? "BUG" : undefined,
  },);
  return {
    file: relative(ROOT, path,),
    score: result.score,
    verdict: result.verdict,
    suggestions: result.suggestions,
  };
}

/** Bounded stdout window: never dump the whole corpus. */
export const MAX_ROWS = 20;

/** Pure: cap an ordered list to the bounded output window. */
export function capRows<T,>(rows: readonly T[], limit: number = MAX_ROWS,): T[] {
  return rows.slice(0, Math.max(0, limit,),);
}

/** Pure: the one deterministic summary line the gate prints. */
export function summaryLine(actionable: number, scanned: number,): string {
  return `${actionable} actionable / ${scanned} scanned`;
}

/** Match the ticket basename in a `git diff --name-only` path. */
const DIFF_TICKET = /(?:^|\/)\.plan\/tickets\/([^/]+\.md)$/;

/**
 * Pure: map raw `git diff --name-only` paths to scannable ticket paths.
 * Non-ticket paths, nested paths and skipped names are dropped.
 */
export function selectDiffTickets(changedPaths: readonly string[], ticketsDir: string,): string[] {
  const selected: string[] = [];
  for (const raw of changedPaths) {
    const name = DIFF_TICKET.exec(raw.trim().replaceAll("\\", "/",),)?.[1];
    if (name === undefined || !isScannableTicket(name,)) { continue; }
    selected.push(resolve(ticketsDir, name,),);
  }
  return [...new Set(selected,),].sort();
}

/** Ticket paths changed versus `ref`, from the caller git repo. */
function changedPathsSince(ref: string,): string[] {
  const proc = Bun.spawnSync(
    ["git", "diff", "--name-only", "--diff-filter=ACMR", ref, "--", ".plan/tickets",],
    { cwd: process.cwd(), },
  );
  if (proc.exitCode !== 0) {
    throw new Error(`git diff against ${ref} failed: ${proc.stderr.toString().trim()}`,);
  }
  return proc.stdout.toString().split("\n",).filter((line,) => line !== "");
}

export interface GateDecision {
  exitCode: number;
  lines: string[];
}

/** Warn/error lines and exit code for a set of scores under a gate mode. */
export function gateDecision(scores: readonly TicketScore[], gate: BriefingGate,): GateDecision {
  if (gate === "off") { return { exitCode: 0, lines: [], }; }
  const lines: string[] = [];
  let exitCode = 0;
  for (const score of scores) {
    if (score.score >= 4) { continue; }
    const isReject = score.score < 3;
    const prefix = isReject && gate === "fail" ? "error" : "warn";
    if (prefix === "error") { exitCode = 1; }
    lines.push(`${prefix}: ${score.file} scored ${score.score} (${score.verdict}) — ${score.suggestions.join("; ",)}`,);
  }
  return { exitCode, lines, };
}

function main(): void {
  const args = runScript(
    object({
      ticket: optional(argument(string(),),),
      diffBase: optional(option("--diff-base", string(),),),
    },),
    {
      programName: "check-briefing",
      brief: "Score .plan tickets against the BriefingScript five-axis rubric.",
      help: "option",
    },
  );
  const gate = resolveGate(process.env.BRIEFING_GATE,);
  const envDir = process.env.BRIEFING_TICKETS_DIR;
  const ticketsDir = envDir === undefined || envDir === "" ? TICKETS_DIR : resolve(envDir,);
  const diffBase = args.diffBase ?? process.env.BRIEFING_DIFF_BASE;
  let paths: string[];
  if (args.ticket !== undefined) {
    paths = [resolveTicketPath(args.ticket, ticketsDir,),];
  } else if (diffBase !== undefined && diffBase !== "") {
    paths = selectDiffTickets(changedPathsSince(diffBase,), ticketsDir,);
  } else {
    paths = listTickets(ticketsDir,);
  }
  const scores = paths.map(scoreTicketFile,);
  const width = Math.max(10, ...scores.map((score,) => score.file.length),);
  for (const score of capRows(scores,)) {
    console.log(`${score.file.padEnd(width,)}  ${String(score.score,)}/5  ${score.verdict}`,);
  }
  const actionable = scores.filter((score,) => score.score >= 4).length;
  console.log(summaryLine(actionable, scores.length,),);
  const decision = gateDecision(scores, gate,);
  for (const line of decision.lines) { console.error(line,); }
  process.exitCode = decision.exitCode;
}

if (import.meta.main) { main(); }
