// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Blocking gate: minify every tracked HTML template with the production
 * options and fail on parse errors or guarded-attribute count drift.
 */
import { minify as minifyHTML, type Options, } from "html-minifier-terser";
import { execFileSync, } from "node:child_process";
import { existsSync, readFileSync, } from "node:fs";
import { join, } from "node:path";
import { defaultHTMLOptions, } from "../src/content/minify";

const TEMPLATE_ROOTS = ["src/views", "src/components", "src/partials",];
const GUARDED_ATTRIBUTES = ["data-testid", "x-*", "@*", ":*", "hx-*",];

const ATTRIBUTE_RE = /\s(data-testid|x-[\w.-]+|@[\w.-]+|:[\w.-]+|hx-[\w.-]+)\s*=/g;

/** Group an attribute name into one of the reported buckets. */
function bucket(name: string,): string {
  if (name === "data-testid") { return name; }
  if (name.startsWith("x-",)) { return "x-*"; }
  if (name.startsWith("@",)) { return "@*"; }
  if (name.startsWith(":",)) { return ":*"; }
  return "hx-*";
}

/**
 * Count guarded attributes in markup. Comments, script/style bodies and
 * quoted values are skipped: Alpine expressions can contain `x-foo=` text
 * that is not an attribute, and comments can hold example markup.
 */
function countGuardedAttributes(html: string,): Record<string, number> {
  const markup = html
    .replaceAll(/<!--[\s\S]*?-->/g, "",)
    .replaceAll(/<script\b[\s\S]*?<\/script\s*>/gi, "",)
    .replaceAll(/<style\b[\s\S]*?<\/style\s*>/gi, "",)
    .replaceAll(/=\s*(?:"[^"]*"|'[^']*')/g, '=""',);
  const counts: Record<string, number> = {};
  for (const match of markup.matchAll(ATTRIBUTE_RE,)) {
    const key = bucket(match[1]!,);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** Return problems for one template, or an empty array when parity holds. */
export async function checkTemplate(
  path: string,
  content: string,
  options: Options = defaultHTMLOptions,
): Promise<string[]> {
  let minified: string;
  try {
    minified = await minifyHTML(content, options,);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error,);
    return [`${path}:1: minify parse error: ${message}`,];
  }
  const before = countGuardedAttributes(content,);
  const after = countGuardedAttributes(minified,);
  return GUARDED_ATTRIBUTES
    .filter((key,) => (before[key] ?? 0) !== (after[key] ?? 0))
    .map((key,) => `${path}:1: ${key} attribute drift ${before[key] ?? 0} -> ${after[key] ?? 0}`);
}

/** Tracked HTML templates under the three template roots. */
function trackedTemplates(root: string,): string[] {
  const listed = execFileSync("git", ["ls-files", "-z", "--", ...TEMPLATE_ROOTS,], {
    cwd: root,
    encoding: "utf8",
  },);
  return listed.split("\0",).filter((path,) => path.endsWith(".html",));
}

/** Run the gate over the whole tracked template corpus. */
async function run(options: Options = defaultHTMLOptions,): Promise<string[]> {
  const root = join(import.meta.dir, "..",);
  const files = trackedTemplates(root,);
  if (files.length === 0) { return ["no tracked HTML templates found",]; }
  const errors: string[] = [];
  for (const path of files) {
    if (!existsSync(join(root, path,),)) {
      errors.push(`${path}:1: tracked template missing from checkout`,);
      continue;
    }
    errors.push(...await checkTemplate(path, readFileSync(join(root, path,), "utf8",), options,),);
  }
  return errors;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..",);
  const count = trackedTemplates(root,).length;
  const errors = await run();
  if (errors.length > 0) {
    console.error(`HTML minify-parity failed (${errors.length} problem(s)):`,);
    for (const error of errors) { console.error(` - ${error}`,); }
    process.exit(1,);
  }
  console.log(`HTML minify-parity passed: ${count} tracked templates, no parse errors or attribute drift.`,);
}
