// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Render docs/reference/api.md from docs/reference/openapi.json.
 *
 * The spec (written by scripts/generate-openapi.ts) owns the endpoint table;
 * maintainers own only the prose between the `api-reference:handwritten`
 * markers, which is copied through verbatim on every run. Operations with
 * neither `summary` nor `description` are rendered as `—` rather than given
 * an invented summary. Tables are split by API version so v2 can land without
 * mixing into v1.
 *
 * Regenerate with `bun run openapi && bun run openapi:md`.
 */
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..",);
const SPEC_PATH = path.join(ROOT, "docs", "reference", "openapi.json",);
const DOC_PATH = path.join(ROOT, "docs", "reference", "api.md",);

const HAND_BEGIN = "<!-- api-reference:handwritten:begin -->";
const HAND_END = "<!-- api-reference:handwritten:end -->";
const GEN_BEGIN = "<!-- api-reference:generated:begin -->";
const GEN_END = "<!-- api-reference:generated:end -->";
const METHODS = ["get", "post", "put", "patch", "delete", "head", "options", "trace",] as const;

interface Operation {
  summary?: string;
  description?: string;
}

interface Row {
  method: string;
  route: string;
  summary: string;
}

/** v1 and v2 get their own tables; the rest is grouped after them. */
function versionOf(route: string,): string {
  const version = /^\/api\/v(\d+)(?:\/|$)/.exec(route,);
  if (version) { return `v${version[1]}`; }
  return route.startsWith("/api/",) ? "Unversioned API" : "Other paths";
}

/** Numeric versions first (v1, v2, ...), then fallback groups alphabetically. */
function compareGroups(a: string, b: string,): number {
  const versionA = /^v(\d+)$/.exec(a,);
  const versionB = /^v(\d+)$/.exec(b,);
  if (versionA && versionB) { return Number(versionA[1],) - Number(versionB[1],); }
  if (versionA) { return -1; }
  if (versionB) { return 1; }
  return a.localeCompare(b,);
}

/** A pipe or newline in a spec field would break the markdown table cell. */
function cell(text: string,): string {
  return text.replace(/\r?\n/g, " ",).replace(/\|/g, "\\|",).trim();
}

/** Regeneration must never overwrite prose the maintainers own. */
function handwrittenFrom(current: string | null,): string {
  if (!current) { return ""; }
  const start = current.indexOf(HAND_BEGIN,);
  const end = current.indexOf(HAND_END,);
  if (start < 0 || end < start) { return ""; }
  return current.slice(start + HAND_BEGIN.length, end,).trim();
}

function render(
  spec: { paths: Record<string, Record<string, Operation>> },
  handwritten: string,
): { markdown: string; hollow: number; total: number } {
  const byGroup = new Map<string, Row[]>();
  let hollow = 0;
  let total = 0;
  for (const [route, item,] of Object.entries(spec.paths ?? {},)) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op) { continue; }
      total++;
      const summary = cell(op.summary ?? op.description ?? "",);
      if (!summary) { hollow++; }
      const group = versionOf(route,);
      const rows = byGroup.get(group,) ?? [];
      rows.push({ method: method.toUpperCase(), route: cell(route,), summary: summary || "—", },);
      byGroup.set(group, rows,);
    }
  }
  const groups = [...byGroup.keys(),].sort(compareGroups,);
  const lines = [
    "<!-- SPDX-License-Identifier: Apache-2.0 -->",
    "<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->",
    "",
    "# API Reference",
    "",
    "> **DO NOT EDIT.** This page is generated from `docs/reference/openapi.json`",
    "> by `bun run openapi:md`. Edit only the region between the",
    "> `api-reference:handwritten` markers, then regenerate with",
    "> `bun run openapi && bun run openapi:md`.",
    "",
    HAND_BEGIN,
    ...(handwritten ? [handwritten,] : []),
    HAND_END,
    "",
    GEN_BEGIN,
    "",
    `${hollow} of ${total} operations have no \`summary\`/\`description\` in the spec; those rows render as \`—\`.`,
    "",
  ];
  for (const group of groups) {
    lines.push(`## ${group} endpoints`, "", "| Method | Path | Summary |", "| --- | --- | --- |",);
    const rows = (byGroup.get(group,) ?? []).sort(
      (a, b,) => a.route.localeCompare(b.route,) || a.method.localeCompare(b.method,),
    );
    for (const row of rows) {
      lines.push(`| ${row.method} | ${row.route} | ${row.summary} |`,);
    }
    lines.push("",);
  }
  lines.push(GEN_END, "",);
  return { markdown: lines.join("\n",), hollow, total, };
}

const spec = await Bun.file(SPEC_PATH,).json() as { paths: Record<string, Record<string, Operation>> };
const currentFile = Bun.file(DOC_PATH,);
const current = await currentFile.exists() ? await currentFile.text() : null;
const { markdown, hollow, total, } = render(spec, handwrittenFrom(current,),);
// The check runner runs gates in parallel (default 4 jobs). Writing an
// unchanged tracked file would race gates that read it (md - lint), so only
// write on real change. Drift still lands on disk for the freshness gate.
if (current !== markdown) {
  await Bun.write(DOC_PATH, markdown,);
  process.stdout.write(`wrote docs/reference/api.md (${total} operations, ${hollow} hollow)\n`,);
} else {
  process.stdout.write(`docs/reference/api.md up to date (${total} operations, ${hollow} hollow)\n`,);
}
