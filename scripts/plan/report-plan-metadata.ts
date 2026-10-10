// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `plan:report` — read-only reconciliation reporting over the plan index and
 * `.plan/` frontmatter. This is the repo-side vehicle for the reporting scope
 * of TASK-plan-index-tagging-binding-reconciliation: giwt is a pinned external
 * dependency, so the command ships here instead of as a `giwt plan report`
 * subcommand. This file loads the tree, dispatches the subcommand, and renders;
 * the queries themselves live in `plan-report-queries.ts`, which shares the
 * normalizer's field parsing (`plan-markdown-fields.ts`) and the epic-owner
 * resolver (splitEpicCandidates) — one implementation.
 *
 * Subcommands:
 *   (default)     aggregate: totals, top tags, top epics, orphan count
 *   tags <tag>    every index entry whose tags include <tag> (case-insensitive)
 *   epic <id>     every index entry bound to epic <id> (case-insensitive slug)
 *   orphans       three sections:
 *                   (a) orphan tags — a tag on an index entry that NO plan .md
 *                       frontmatter declares (stale adoption or corruption)
 *                   (b) orphan bindings — an `epic` value naming no
 *                       .plan/epics/<slug>.md
 *                   (c) dangling **Related:** refs — prose refs naming no plan
 *                       file
 *
 * Read-only: never writes. Orphans are advisory, not a gate.
 */
import { existsSync, readdirSync, readFileSync, } from "node:fs";
import { join, resolve, } from "node:path";
import {
  argument,
  flag,
  multiple,
  object,
  runScript,
  string,
  withDefault,
} from "../../src/cli/parser";
import {
  aggregate,
  byEpic,
  byTag,
  danglingRelated,
  declaredTags,
  orphanBindings,
  orphanTags,
  type PlanIndex,
} from "./plan-report-queries";

// ── CLI ────────────────────────────────────────────────────────
if (import.meta.main) {
  const parser = object({
    args: multiple(argument(string(),),),
    json: withDefault(flag("--json",), false,),
  },);
  const { args, json, } = runScript(parser, {
    programName: "plan:report",
    brief: "Read-only plan-index reporting: tags/epics queries, orphans, aggregate.",
    help: "option",
  },);
  const ROOT = resolve(import.meta.dir, "..", "..",);
  const command = args[0] ?? "aggregate";
  const value = args[1];

  const index: PlanIndex = existsSync(join(ROOT, ".plan", "tickets", "index.json",),)
    ? JSON.parse(readFileSync(join(ROOT, ".plan", "tickets", "index.json",), "utf8",),)
    : {};
  const files: Record<string, string> = {};
  const known = new Set<string>();
  for (const dir of [".plan/epics", ".plan/tickets",]) {
    const abs = join(ROOT, dir,);
    for (const f of existsSync(abs,) ? readdirSync(abs,) : []) {
      if (!f.endsWith(".md",)) { continue; }
      files[join(dir, f,)] = readFileSync(join(abs, f,), "utf8",);
      known.add(f.replace(/\.md$/, "",),);
    }
  }
  const declared = declaredTags(files,);
  const epicExists = (slug: string,): boolean => existsSync(join(ROOT, ".plan", "epics", `${slug}.md`,),);
  const printRows = (r: { extid: string; status: string; source: string }[],): void => {
    for (const x of r) { console.log(`${x.extid}  ${x.status}  ${x.source}`,); }
    console.log(`(${r.length} ticket(s),)`,);
  };

  if (json) {
    console.log(JSON.stringify(
      {
        command,
        value: value ?? null,
        result: command === "tags"
          ? byTag(index, value ?? "",)
          : command === "epic"
          ? byEpic(index, value ?? "",)
          : command === "orphans"
          ? {
            orphanTags: orphanTags(index, declared,),
            orphanBindings: orphanBindings(index, epicExists,),
            danglingRelated: danglingRelated(files, known,),
          }
          : aggregate(index,),
      },
      null,
      1,
    ),);
    process.exit(0,);
  }

  if (command === "tags" || command === "epic") {
    if (!value) {
      console.error(`usage: plan:report ${command} <${command === "tags" ? "tag" : "epic-id"}>`,);
      process.exit(1,);
    }
    printRows(command === "tags" ? byTag(index, value,) : byEpic(index, value,),);
  } else if (command === "orphans") {
    const ot = orphanTags(index, declared,);
    const ob = orphanBindings(index, epicExists,);
    const dr = danglingRelated(files, known,);
    console.log(`(a) orphan tags (declared by no plan .md): ${ot.length}`,);
    for (const x of ot) { console.log(`    ${x.extid}: ${x.tag}`,); }
    console.log(`(b) orphan epic bindings (naming no epic file): ${ob.length}`,);
    for (const x of ob) { console.log(`    ${x.extid}: ${x.epic}`,); }
    console.log(`(c) dangling **Related:** refs: ${dr.length}`,);
    for (const x of dr) { console.log(`    ${x.file}: ${x.ref}`,); }
  } else if (command === "aggregate") {
    const a = aggregate(index,);
    console.log(`tickets: ${a.tickets}  distinct tags: ${a.distinctTags}  bindings: ${a.bindings}`,);
    console.log("top tags:",);
    for (const [t, n,] of a.topTags) { console.log(`  ${n}  ${t}`,); }
    console.log("top epics:",);
    for (const [e, n,] of a.topEpics) { console.log(`  ${n}  ${e}`,); }
    const orphans = orphanTags(index, declared,).length +
      orphanBindings(index, epicExists,).length;
    console.log(`orphan rows (see \`plan:report orphans\`): ${orphans}`,);
  } else {
    console.error(`unknown command: ${command} (aggregate | tags | epic | orphans)`,);
    process.exit(1,);
  }
}
