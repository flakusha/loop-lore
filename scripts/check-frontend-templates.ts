// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Render every physical view through the production template resolver. */
import { readdirSync, } from "node:fs";
import { join, relative, } from "node:path";
import { loadView, } from "../src/routes/views/layout";

const root = join(import.meta.dir, "..",);
const viewsRoot = join(root, "src", "views",);
const errors: string[] = [];

function htmlFiles(dir: string,): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, },)) {
    const file = join(dir, entry.name,);
    if (entry.isDirectory()) { files.push(...htmlFiles(file,),); }
    else if (entry.isFile() && entry.name.endsWith(".html",)) { files.push(file,); }
  }
  return files;
}

const files = htmlFiles(viewsRoot,);
if (files.length === 0) {
  console.error(`Frontend template preflight failed: no views found under ${viewsRoot}.`,);
  process.exit(1,);
}
for (const file of files) {
  const name = relative(viewsRoot, file,).replaceAll("\\", "/",).replace(/\.html$/, "",);
  try {
    if (loadView(name,).trim() === "") { errors.push(`${name}: rendered empty`,); }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error,);
    errors.push(`${name}: ${message}`,);
  }
}

if (errors.length > 0) {
  console.error(`Frontend template preflight failed (${errors.length} problem(s)):`,);
  for (const error of errors) { console.error(` - ${error}`,); }
  process.exit(1,);
}

console.log(`Frontend template preflight passed: ${files.length} physical views.`,);
