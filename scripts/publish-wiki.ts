// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Stage the user-facing docs subset for GitHub wiki publishing.
 *
 * The wiki carries end-user documentation only. Specs, ops runbooks,
 * research, ideas and the generated plan mirror stay on the VitePress site.
 * The subset is the ENTRIES table below: extend it to publish more, never by
 * broadening a glob.
 *
 * Link rewrite keeps wiki pages self-contained. In-subset `/guide/<slug>`
 * links become wiki page names; every other absolute or repo-relative link
 * that leaves the subset becomes an absolute URL against --pages-base (docs
 * tree) or the --repo blob view (repo files), so wiki pages never 404 on
 * links the wiki does not carry.
 *
 * Usage: bun run wiki:publish -- --wiki-dir <dir> [--check]
 *   [--repo owner/name] [--ref dev] [--pages-base <url>]
 * The CI workflow (.github/workflows/wiki.yml) checks out the `.wiki` repo
 * into --wiki-dir, runs this script, then commits and pushes.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { dirname, join, posix, resolve, } from "node:path";

interface WikiOptions {
  wikiDir: string;
  check: boolean;
  repo: string;
  ref: string;
  pagesBase: string;
}

type RewriteKind = "internal" | "external" | "unresolved";

/** [repo-relative source, wiki page name], in sidebar order. */
const ENTRIES: Array<readonly [string, string,]> = [
  ["README.md", "Home",],
  ["docs/guide/getting-started.md", "getting-started",],
  ["docs/guide/installation.md", "installation",],
  ["docs/guide/first-chat.md", "first-chat",],
  ["docs/guide/characters.md", "characters",],
  ["docs/guide/personas.md", "personas",],
  ["docs/guide/worlds.md", "worlds",],
  ["docs/guide/gallery.md", "gallery",],
  ["docs/guide/settings.md", "settings",],
  ["docs/guide/mfa.md", "mfa",],
  ["docs/guide/state-and-instances.md", "state-and-instances",],
  ["docs/guide/local-models.md", "local-models",],
  ["docs/guide/editor-lsp.md", "editor-lsp",],
  ["docs/guide/two-instance-federation.md", "two-instance-federation",],
  ["docs/i18n/README.es.md", "README-es",],
  ["docs/i18n/README.fr.md", "README-fr",],
  ["docs/i18n/README.ja.md", "README-ja",],
  ["docs/i18n/README.ko.md", "README-ko",],
  ["docs/i18n/README.ru.md", "README-ru",],
  ["docs/i18n/README.zh.md", "README-zh",],
];

/** One nesting level (badges) so outer links survive image targets. */
const LINK_PATTERN = /\[((?:[^\[\]]|\[[^\]]*\])*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function defaultPagesBase(repo: string,): string {
  const slash = repo.indexOf("/",);
  return `https://${repo.slice(0, slash,)}.github.io/${repo.slice(slash + 1,)}/docs`;
}

function parseOptions(argv: Array<string>,): WikiOptions {
  const opts: WikiOptions = {
    check: false,
    pagesBase: "",
    ref: "dev",
    repo: "flakusha/loop-lore",
    wikiDir: ".tmp/wiki-stage",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    const next = argv[i + 1] ?? "";
    if (arg === "--check") {
      opts.check = true;
    } else if (arg === "--wiki-dir" || arg === "--repo" || arg === "--ref" || arg === "--pages-base") {
      if (next === "") {
        console.error(`missing value for ${arg}`,);
        process.exit(1,);
      }
      i++;
      if (arg === "--wiki-dir") {
        opts.wikiDir = next;
      } else if (arg === "--repo") {
        opts.repo = next;
      } else if (arg === "--ref") {
        opts.ref = next;
      } else {
        opts.pagesBase = next;
      }
    } else {
      console.error(`unknown argument: ${arg}`,);
      process.exit(1,);
    }
  }
  if (opts.pagesBase === "") {
    opts.pagesBase = defaultPagesBase(opts.repo,);
  }
  return opts;
}

/** Repo-relative path for a link target, or null when it escapes the repo. */
function toRepoRelative(src: string, path: string,): string | null {
  if (path.startsWith("/",)) {
    return path.slice(1,);
  }
  const abs = posix.normalize(posix.join("/", dirname(src,), path,),);
  const rel = abs.startsWith("/",) ? abs.slice(1,) : abs;
  return rel === "" || rel.startsWith("..",) ? null : rel;
}

/** Absolute site path resolved against the docs tree, or null when absent. */
function sitePage(root: string, rel: string,): string | null {
  const docRel = `docs/${rel}`;
  if (existsSync(join(root, docRel,),) || existsSync(join(root, `${docRel}.md`,),)) {
    return docRel.slice("docs/".length,).replace(/\.md$/, "",);
  }
  return null;
}

function mapTarget(
  root: string,
  opts: WikiOptions,
  pageBySrc: Map<string, string>,
  src: string,
  raw: string,
): { text: string; kind: RewriteKind } {
  const hash = raw.indexOf("#",);
  const path = hash < 0 ? raw : raw.slice(0, hash,);
  const anchor = hash < 0 ? "" : raw.slice(hash,);
  if (path === "" || path.startsWith("#",) || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path,)) {
    return { kind: "external", text: raw, };
  }
  // Absolute VitePress links are site-rooted; the site source lives under docs/.
  const absolute = path.startsWith("/",);
  const rel = toRepoRelative(src, path,);
  if (rel !== null) {
    const candidates = rel.endsWith(".md",) ? [rel,] : [rel, `${rel}.md`,];
    if (absolute && !rel.startsWith("docs/",)) {
      candidates.push(`docs/${rel}`,);
      if (!rel.endsWith(".md",)) {
        candidates.push(`docs/${rel}.md`,);
      }
    }
    for (const candidate of candidates) {
      const page = pageBySrc.get(candidate,);
      if (page !== undefined) {
        return { kind: "internal", text: `${page}${anchor}`, };
      }
    }
    if (rel.startsWith("docs/",)) {
      const web = rel.slice("docs/".length,).replace(/\.md$/, "",);
      return { kind: "external", text: `${opts.pagesBase}/${web}${anchor}`, };
    }
    if (absolute) {
      const web = sitePage(root, rel,);
      if (web !== null) {
        return { kind: "external", text: `${opts.pagesBase}/${web}${anchor}`, };
      }
    }
    // .plan/ generated artifacts may be absent from a fresh checkout (they
    // are gitignored) while present on dev, so they skip the existence probe.
    if (rel.startsWith(".plan/",) || existsSync(join(root, rel,),)) {
      return { kind: "external", text: `https://github.com/${opts.repo}/blob/${opts.ref}/${rel}${anchor}`, };
    }
  }
  return { kind: "unresolved", text: raw, };
}

function extractTitle(body: string, fallback: string,): string {
  for (const line of body.split("\n",)) {
    const match = /^#\s+(.+?)\s*$/.exec(line,);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }
  return fallback;
}

function main(): void {
  const opts = parseOptions(process.argv.slice(2,),);
  const root = resolve(import.meta.dir, "..",);
  const pageBySrc = new Map<string, string>(ENTRIES,);
  for (const [src,] of ENTRIES) {
    if (!existsSync(join(root, src,),)) {
      console.error(`missing subset source: ${src}`,);
      process.exit(1,);
    }
  }
  const out = resolve(root, opts.wikiDir,);
  rmSync(out, { force: true, recursive: true, },);
  mkdirSync(out, { recursive: true, },);
  const counts: Record<RewriteKind, number> = { external: 0, internal: 0, unresolved: 0, };
  const missed: Array<string> = [];
  const sidebar = ["<!-- Generated by scripts/publish-wiki.ts — do not edit in the wiki. -->", "",];
  for (const [src, page,] of ENTRIES) {
    const body = readFileSync(join(root, src,), "utf8",);
    const rewritten = body.replace(LINK_PATTERN, (match, text: string, target: string,) => {
      const mapped = mapTarget(root, opts, pageBySrc, src, target,);
      counts[mapped.kind]++;
      if (mapped.kind === "unresolved") {
        missed.push(`${src}: ${target}`,);
        return match;
      }
      return `[${text}](${mapped.text})`;
    },);
    writeFileSync(join(out, `${page}.md`,), rewritten,);
    sidebar.push(`- [${extractTitle(body, page,)}](${page})`,);
  }
  writeFileSync(join(out, "_Sidebar.md",), `${sidebar.join("\n",)}\n`,);
  console.log(
    `staged ${ENTRIES.length} pages -> ${opts.wikiDir} (internal=${counts.internal} external=${counts.external} unresolved=${counts.unresolved})`,
  );
  if (counts.unresolved > 0) {
    for (const line of missed.slice(0, 20,)) {
      console.error(`  unresolved ${line}`,);
    }
    if (opts.check) {
      process.exit(1,);
    }
  }
}

main();
