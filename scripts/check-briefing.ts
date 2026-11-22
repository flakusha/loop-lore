// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * BriefingScript ticket-quality gate.
 *
 * Batch mode scores every `.plan/tickets/*.md` (minus index, help and BUG
 * tickets); a positional ticket path or slug scores one ticket. Gate mode
 * comes from BRIEFING_GATE: off (table only), warn (default), fail (reject
 * scores exit 1). The scorer itself is src/plan/briefing-linter.ts.
 *
 * Usage:
 *   bun run scripts/check-briefing.ts
 *   bun run scripts/check-briefing.ts TASK-test-untested-routes
 *   BRIEFING_GATE=fail bun run scripts/check-briefing.ts
 */

import { readdirSync, readFileSync, } from "node:fs";
import { basename, relative, resolve, } from "node:path";
import { argument, object, optional, runScript, string, } from "../src/cli/parser";
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

/** Accept a path or a bare ticket slug. */
export function resolveTicketPath(value: string,): string {
  return value.endsWith(".md",) ? resolve(value,) : resolve(TICKETS_DIR, `${value}.md`,);
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
    object({ ticket: optional(argument(string(),),), },),
    {
      programName: "check-briefing",
      brief: "Score .plan tickets against the BriefingScript five-axis rubric.",
      help: "option",
    },
  );
  const gate = resolveGate(process.env.BRIEFING_GATE,);
  const paths = args.ticket === undefined
    ? listTickets(TICKETS_DIR,)
    : [resolveTicketPath(args.ticket,),];
  const scores = paths.map(scoreTicketFile,);
  const width = Math.max(10, ...scores.map((score,) => score.file.length),);
  for (const score of scores) {
    console.log(`${score.file.padEnd(width,)}  ${String(score.score,)}/5  ${score.verdict}`,);
  }
  const actionable = scores.filter((score,) => score.score >= 4).length;
  console.log(`briefing - gate: ${scores.length} ticket(s), ${actionable} actionable`,);
  const decision = gateDecision(scores, gate,);
  for (const line of decision.lines) { console.error(line,); }
  process.exitCode = decision.exitCode;
}

if (import.meta.main) { main(); }
