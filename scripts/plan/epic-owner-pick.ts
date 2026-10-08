// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Epic owner-picking rule for multi-epic `**Epic:**` values.
 *
 * Some tickets name two or more epics in one header — a comma/slash/semicolon
 * list, or a legacy prose TITLE instead of a slug. The index records exactly
 * one owner per ticket, so the rule picks it: **the first listed candidate
 * that names an existing `.plan/epics/<slug>.md` wins** (a candidate is a
 * bare slug or an exact entry in the generated title table). Anything with
 * no resolvable candidate is left untouched and reported — never guessed.
 *
 * The title table is GENERATED from current epic H1s (`--gen` below); exact
 * matches only, so near-misses stay on the remainder list for a human.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, } from "node:fs";
import { join, resolve, } from "node:path";
import { flag, object, runScript, withDefault, } from "../../src/cli/parser";
import {
  canonicalIndexOrder,
  fieldLines,
  type IndexEntryLike,
} from "./normalize-plan-metadata";

/** Split a multi-epic value into candidates, in author order. A `/` inside
 * parentheses (`A (X/Y)`) or a `.plan/epics/…` path is not a separator. */
export function splitEpicCandidates(raw: string,): string[] {
  const chunks: string[] = [];
  let depth = 0;
  let current = "";
  const push = () => {
    // Order matters: strip the `(note)` annotation BEFORE the `.md` suffix
    // (a `x.md` (logging) token ends in a paren, not in `.md`), and strip
    // backticks both before and after (a trailing backtick hides `.md`).
    const token = current
      .trim()
      .replace(/^[`*>\s]*/, "",)
      .replace(/\s*\(.*\)\s*$/, "",)
      .replace(/[`*\s]*$/, "",)
      .replace(/^\.plan\/epics\//, "",)
      .replace(/\.md$/i, "",)
      .replace(/[`*\s]*$/, "",)
      .trim();
    if (token) { chunks.push(token,); }
    current = "";
  };
  for (const char of raw) {
    if (char === "(") { depth++; }
    if (char === ")" && depth > 0) { depth--; }
    // `+` joins two candidates exactly like `,` does (`a.md (x) + b.md (y)`)
    // — but ONLY when both sides carry a parenthetical role note; otherwise
    // it is title prose (`Avatar Alpha Channel + VN Layering`) and splitting
    // would destroy an exact table match.
    const plusJoins = char === "+" && depth === 0 && /\([^)]*\)\s*$/.test(current,);
    const isSep = char === "," || char === ";" || (char === "/" && depth === 0) || plusJoins;
    if (isSep && !current.includes(".plan/epics/",)) {
      push();
    } else {
      current += char;
    }
  }
  push();
  return chunks;
}

/**
 * The owning epic for a raw `**Epic:**` value, or null when nothing
 * resolves. Already-canonical single slugs pass through unchanged.
 */
export function pickEpicOwner(
  raw: string,
  slugs: ReadonlySet<string>,
  titles: Readonly<Record<string, string>>,
): string | null {
  // Whole-value exact title match FIRST: titles can contain separators
  // (`Wardrobe / Loadout Avatar Variants`) that splitting would destroy.
  const whole = raw.trim();
  const wholeTitled = titles[whole];
  if (wholeTitled && slugs.has(wholeTitled,)) { return wholeTitled; }
  for (const candidate of splitEpicCandidates(raw,)) {
    if (slugs.has(candidate,)) { return candidate; }
    const titled = titles[candidate];
    if (titled && slugs.has(titled,)) { return titled; }
  }
  return null;
}

const EPIC_H1 = /^#\s+EPIC:\s*(.+?)\s*$/m;
const EPIC_H1_LEGACY = /^#\s+Epic:\s*(.+?)\s*$/m;

/** Scan epic H1s (both dialects) into a title→slug table. Duplicate titles
 * keep the first file in sorted order; the rest are reported, never merged. */
export function scanEpicTitles(dir: string,): { titles: Record<string, string>; ambiguous: string[] } {
  const titles: Record<string, string> = {};
  const ambiguous: string[] = [];
  for (const file of readdirSync(dir,).filter((f,) => f.startsWith("epic-",) && f.endsWith(".md",)).sort()) {
    const text = readFileSync(join(dir, file,), "utf8",);
    const title = (text.match(EPIC_H1,) ?? text.match(EPIC_H1_LEGACY,))?.[1].trim();
    if (!title) { continue; }
    if (title in titles) { ambiguous.push(`${title}: kept ${titles[title]}, dropped ${file.replace(/\.md$/, "",)}`,); }
    else { titles[title] = file.replace(/\.md$/, "",); }
  }
  return { titles, ambiguous, };
}

// ── CLI ────────────────────────────────────────────────────────
if (import.meta.main) {
  const parser = object({
    gen: withDefault(flag("--gen",), false,),
    apply: withDefault(flag("--apply",), false,),
  },);
  const { gen, apply, } = runScript(parser, {
    programName: "epic-owner-pick",
    brief: "Collapse multi-epic **Epic:** values to the first existing epic owner; --gen regenerates the title table.",
    help: "option",
  },);
  const ROOT = resolve(import.meta.dir, "..", "..",);
  const epicsDir = join(ROOT, ".plan", "epics",);
  const slugs = new Set(
    readdirSync(epicsDir,)
      .filter((f,) => f.startsWith("epic-",) && f.endsWith(".md",))
      .map((f,) => f.replace(/\.md$/, "",)),
  );
  const { titles, ambiguous, } = scanEpicTitles(epicsDir,);

  if (gen) {
    const body = Object.entries(titles,)
      .map(([title, slug,],) => `  ${JSON.stringify(title,)}: ${JSON.stringify(slug,)},`)
      .join("\n",);
    writeFileSync(
      join(import.meta.dir, "epic-titles.generated.ts",),
      `// SPDX-License-Identifier: LGPL-3.0-or-later\n// SPDX-FileCopyrightText: 2026 Loop Lore Contributors\n\n// DO NOT EDIT MANUALLY — generated by \`bun run scripts/plan/epic-owner-pick.ts --gen\`.\n// Source of truth: \`# EPIC:\`/\`# Epic:\` H1s in \`.plan/epics/*.md\`.\nexport const EPIC_TITLES: Record<string, string> = {\n${body}\n};\n`,
    );
    console.log(`titles: ${Object.keys(titles,).length}, ambiguous: ${ambiguous.length}`,);
    for (const line of ambiguous) { console.log(`  ambiguous: ${line}`,); }
    process.exit(0,);
  }

  const indexPath = join(ROOT, ".plan", "tickets", "index.json",);
  const index = JSON.parse(readFileSync(indexPath, "utf8",),) as Record<string, IndexEntryLike>;
  const next: Record<string, IndexEntryLike> = { ...index, };
  let mdRewritten = 0;
  const owners = new Map<string, string>();
  const remainder: string[] = [];

  for (const [key, entry,] of Object.entries(index,)) {
    const raw = (entry.epic ?? "").trim();
    if (!raw) { continue; }
    const owner = pickEpicOwner(raw, slugs, titles,);
    if (!owner) {
      if (/[,/;]/.test(raw,) || !(raw in titles) && !slugs.has(raw,)) {
        remainder.push(`${key}: no resolvable candidate :: ${raw.slice(0, 100,)}`,);
      }
      continue;
    }
    if (owner === raw) { continue; }
    if (!entry.source || !existsSync(join(ROOT, entry.source,),)) {
      remainder.push(`${key}: owner ${owner} but source missing`,);
      continue;
    }
    const abs = join(ROOT, entry.source,);
    const text = readFileSync(abs, "utf8",);
    const line = fieldLines(text,).find((l,) => l.name === "Epic");
    if (!line) {
      remainder.push(key + ": owner " + owner + " but ticket has no Epic header (left untouched)",);
      continue;
    }
    const mdOwner = pickEpicOwner(line.value, slugs, titles,);
    if (mdOwner !== owner) {
      remainder.push(key + ": index picks " + owner + " but md picks " + (mdOwner ?? "nothing"),);
      continue;
    }
    if (apply) { writeFileSync(abs, text.replace(line.raw, `**Epic:** ${owner}`,),); }
    next[key] = { ...entry, epic: owner, };
    owners.set(key, owner,);
    mdRewritten++;
  }

  if (apply) {
    writeFileSync(indexPath, `${JSON.stringify(canonicalIndexOrder(next,), null, 2,)}\n`,);
  }
  console.log(`dry-run: ${!apply}`,);
  console.log("owners: " + owners.size + ", md rewrites: " + mdRewritten,);
  for (const [key, owner,] of [...owners.entries(),].sort()) { console.log(`  ${key} -> ${owner}`,); }
  console.log(`remainder (untouched, needs a human): ${remainder.length}`,);
  for (const line of remainder.sort()) { console.log(`  ${line}`,); }
}
