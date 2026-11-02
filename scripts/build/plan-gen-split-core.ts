// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 270

/**
 * Core (pure) logic for splitting oversized generated plan-gen markdown pages.
 *
 * Splitting rules:
 * - A page is split by its H2 sections; each section becomes its own page.
 * - If a single H2 section still exceeds the size limit, it is split by H3
 *   subsections (fallback), and any remaining oversized block is paginated
 *   into row chunks (table rows or list items) of rows-per-part.
 * - Slugs use the exact slug algorithm VitePress applies to headings, so
 *   in-page anchors keep resolving after the split.
 */

/** Default per-page size limit in bytes (256 KiB). */
export const SIZE_LIMIT_BYTES = 256 * 1024;

/** Default rows per paginated part. */
export const DEFAULT_ROWS_PER_PART = 5000;

/** A generated page within a split group. */
export interface SplitPage {
  /** File name relative to the group directory (e.g. `edges-part-2.md`). */
  fileName: string;
  /** Human title used on the group index. */
  title: string;
  /** Page body lines, without the prev/next footer. */
  lines: string[];
}

/** Result of splitting one oversized top-level file. */
export interface SplitGroup {
  /** Original file base name without extension (e.g. `interconnect`). */
  name: string;
  /** Lines before the first H2 (title/intro), kept verbatim on the index. */
  preamble: string[];
  pages: SplitPage[];
  /** Heading slug → page file that carries that anchor. */
  anchorMap: Map<string, string>;
}

const rControl = /[\u0000-\u001f]/g;
const rSpecial = /[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g;
const rCombining = /[\u0300-\u036F]/g;

/**
 * Slug algorithm used by VitePress (@mdit-vue/shared slugify, bundled in
 * vitepress 1.6.4). Must not drift from the bundler copy.
 */
function slugifyHeading(raw: string,): string {
  return raw
    .normalize("NFKD",)
    .replace(rCombining, "",)
    .replace(rControl, "",)
    .replace(rSpecial, "-",)
    .replace(/-{2,}/g, "-",)
    .replace(/^-+|-+$/g, "",)
    .replace(/^(\d)/, "_$1",)
    .toLowerCase();
}

/** One H2 block with its optional H3 subdivisions. */
interface H2Group {
  heading: string;
  title: string;
  slug: string;
  /** Lines after the H2 heading up to the first H3 (may be empty). */
  intro: string[];
  subs: Array<{ heading: string; title: string; slug: string; lines: string[] }>;
}

const FENCE_RE = /^\s*(```|~~~)/;

function isHeading(line: string,): boolean {
  return /^#{2,6} /.test(line,);
}

function byteLength(lines: string[],): number {
  let total = 0;
  for (const line of lines) { total += Buffer.byteLength(line, "utf8",) + 1; }
  return total;
}

/** Split raw lines into the preamble plus H2 groups (fence-aware). */
function parseH2Groups(lines: string[],): { preamble: string[]; groups: H2Group[] } {
  const preamble: string[] = [];
  const groups: H2Group[] = [];
  let inFence = false;
  let current: H2Group | null = null;
  let currentSub: H2Group["subs"][number] | null = null;
  for (const line of lines) {
    if (FENCE_RE.test(line,)) { inFence = !inFence; }
    if (!inFence && /^## /.test(line,)) {
      const title = line.replace(/^## /, "",).trim();
      current = {
        heading: line,
        title,
        slug: slugifyHeading(title,),
        intro: [],
        subs: [],
      };
      groups.push(current,);
      currentSub = null;
      continue;
    }
    if (!inFence && /^### /.test(line,) && current !== null) {
      const title = line.replace(/^### /, "",).trim();
      currentSub = {
        heading: line,
        title,
        slug: slugifyHeading(title,),
        lines: [],
      };
      current.subs.push(currentSub,);
      continue;
    }
    if (current === null) { preamble.push(line,); }
    else if (currentSub !== null) { currentSub.lines.push(line,); }
    else { current.intro.push(line,); }
  }
  return { preamble, groups, };
}

/** Atoms of one H2 group: the intro atom (heading included) plus H3 atoms. */
interface Atom {
  name: string;
  title: string;
  lines: string[];
}

function groupAtoms(group: H2Group,): Atom[] {
  const introLines = [group.heading, "", ...group.intro,];
  if (group.subs.length === 0) { return [{ name: group.slug, title: group.title, lines: introLines, },]; }
  const seen = new Set<string>([group.slug,],);
  const atoms: Atom[] = [];
  const introOnlyHeading = group.intro.every((l,) => l.trim() === "");
  const h3Prefix = introOnlyHeading ? [group.heading, "",] : [];
  group.subs.forEach((sub, index,) => {
    let slug = `${group.slug}-${sub.slug}`;
    while (seen.has(slug,)) { slug = `${slug}-${index + 1}`; }
    seen.add(slug,);
    atoms.push({
      name: slug,
      title: `${group.title} — ${sub.title}`,
      lines: [...h3Prefix, sub.heading, "", ...sub.lines,],
    },);
    h3Prefix.length = 0;
  },);
  if (!introOnlyHeading) { atoms.unshift({ name: group.slug, title: group.title, lines: introLines, },); }
  return atoms;
}

const TABLE_HEADER_ROWS = 2;

/**
 * Paginate one oversized atom into row chunks. A new part starts at
 * rows-per-part rows or the size limit, whichever hits first; table pages
 * repeat the table header rows, list pages repeat the heading/intro block.
 */
function paginateAtom(atom: Atom, rowsPerPart: number, sizeLimitBytes: number,): SplitPage[] {
  let flowStart = atom.lines.findIndex((line, i,) => i > 0 && /^(\||- )/.test(line,));
  if (flowStart === -1) { flowStart = atom.lines.length; }
  const isTable = /^\|/.test(atom.lines[flowStart] ?? "",);
  const headerRows = isTable ? TABLE_HEADER_ROWS : 0;
  const header = atom.lines.slice(0, flowStart + headerRows,);
  const items = atom.lines.slice(flowStart + headerRows,);
  const headerBytes = byteLength(header,);
  const pages: SplitPage[] = [];
  let chunk: string[] = [];
  let chunkBytes = headerBytes;
  let part = 1;
  const flush = (): void => {
    pages.push({
      fileName: part === 1 ? `${atom.name}.md` : `${atom.name}-part-${part}.md`,
      title: part === 1 ? atom.title : `${atom.title} (part ${part})`,
      lines: [...header, ...chunk,],
    },);
    part += 1;
    chunk = [];
    chunkBytes = headerBytes;
  };
  for (const item of items) {
    const itemBytes = Buffer.byteLength(item, "utf8",) + 1;
    if (chunk.length > 0 && (chunk.length >= rowsPerPart || chunkBytes + itemBytes > sizeLimitBytes)) { flush(); }
    chunk.push(item,);
    chunkBytes += itemBytes;
  }
  if (chunk.length > 0) { flush(); }
  return pages.length > 0 ? pages : [{ fileName: `${atom.name}.md`, title: atom.title, lines: header, },];
}

function uniqueName(base: string, taken: Set<string>,): string {
  let name = base;
  let n = 1;
  while (taken.has(`${name}.md`,)) {
    n += 1;
    name = `${base}-${n}`;
  }
  taken.add(`${name}.md`,);
  return name;
}

/** Split one generated page's lines into a group of sub-pages. */
export function splitPageLines(options: {
  name: string;
  lines: string[];
  sizeLimitBytes?: number;
  rowsPerPart?: number;
},): SplitGroup {
  const { name, lines, } = options;
  const sizeLimitBytes = options.sizeLimitBytes ?? SIZE_LIMIT_BYTES;
  const rowsPerPart = options.rowsPerPart ?? DEFAULT_ROWS_PER_PART;
  const { preamble, groups, } = parseH2Groups(lines,);
  const pages: SplitPage[] = [];
  const taken = new Set<string>();
  for (const group of groups) {
    const atoms = groupAtoms(group,);
    const totalBytes = atoms.reduce((sum, atom,) => sum + byteLength(atom.lines,), 0,);
    if (totalBytes <= sizeLimitBytes) {
      const fileName = uniqueName(`${group.slug}.md`, taken,);
      pages.push({ fileName, title: group.title, lines: atoms.flatMap((a,) => a.lines), },);
      continue;
    }
    for (const atom of atoms) {
      if (byteLength(atom.lines,) <= sizeLimitBytes) {
        pages.push({ fileName: uniqueName(`${atom.name}.md`, taken,), title: atom.title, lines: atom.lines, },);
        continue;
      }
      for (const page of paginateAtom(atom, rowsPerPart, sizeLimitBytes,)) {
        pages.push({ ...page, fileName: uniqueName(page.fileName, taken,), },);
      }
    }
  }
  const anchorMap = new Map<string, string>();
  for (const page of pages) {
    let inFence = false;
    for (const line of page.lines) {
      if (FENCE_RE.test(line,)) { inFence = !inFence; }
      if (!inFence && isHeading(line,)) {
        const slug = slugifyHeading(line.replace(/^#+ /, "",).trim(),);
        if (!anchorMap.has(slug,)) { anchorMap.set(slug, page.fileName,); }
      }
    }
  }
  return { name, preamble, pages, anchorMap, };
}

/** Render the prev/next footer block for one page. */
export function pageFooter(options: {
  pages: SplitPage[];
  index: number;
  indexHref: string;
},): string[] {
  const { pages, index, indexHref, } = options;
  const parts: string[] = [];
  const prev = pages[index - 1];
  const next = pages[index + 1];
  if (prev) { parts.push(`[← Prev: ${prev.title}](${prev.fileName})`,); }
  parts.push(`[Index](${indexHref})`,);
  if (next) { parts.push(`[Next: ${next.title}](${next.fileName})`,); }
  return ["", "---", "", parts.join(" · ",), "",];
}
