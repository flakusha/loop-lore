// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Install-tree status reporter for the external tooling builds.
 *
 * Reports which build variants are present on disk — project, source ref,
 * accelerator, architecture, install root, and artifact list — without ever
 * launching, executing, or loading any built binary. Discovery is plain
 * filesystem reads only (`exists`/`readdir`/`readlink`/`stat`). Versioned
 * shared libraries are reached solely by following the unversioned `.so`
 * symlink, so stale versioned files from earlier installs are reported only
 * when the current symlink resolves to them.
 *
 * Wording is deliberately report-only: nothing here states or implies that
 * an artifact was run, loaded, or works.
 *
 * Usage:
 *   bun scripts/tooling/status.ts status --root <install-root> [...]
 *   bun scripts/tooling/status.ts verify --json --root <install-root> [...]
 */

import { existsSync, lstatSync, readdirSync, readFileSync, statSync, } from "node:fs";
import { basename, join, resolve, } from "node:path";

/** A single file found on disk inside an installed variant. */
export interface ArtifactReport {
  /** Absolute path of the artifact as discovered (link path, not resolved). */
  path: string;
  /** Whether the entry was found via `bin/` or via a `lib*` `.so` symlink. */
  kind: "binary" | "library";
  /** Source ref recorded at install time, or `"unknown"` when none was recorded. */
  ref: string;
  /** Size in bytes of the file the entry resolves to (`stat` follows symlinks). */
  size: number;
  /** Modification time of the file the entry resolves to, or `"unknown"`. */
  mtime: string;
}

/** Everything reported about one installed variant. */
export interface VariantReport {
  project: string;
  /** Source ref the tree was built from, or `"unknown"` when unrecorded. */
  ref: string;
  accelerator: string;
  arch: string;
  /** Absolute path of the variant install prefix. */
  root: string;
  artifacts: ArtifactReport[];
}

export interface StatusArgs {
  command: "status" | "verify";
  roots: string[];
  json: boolean;
}

const UNKNOWN = "unknown";
const NOTE = "Reported from files present on disk; no binary was launched, executed, or loaded.";

function asText(value: unknown,): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Split `<project>-<accelerator>-<arch>`; anything else keeps the name as project. */
function parseName(name: string,): { project: string; accelerator: string; arch: string } {
  const parts = name.split("-",);
  if (parts.length >= 3) {
    const arch = parts.pop() as string;
    const accelerator = parts.pop() as string;
    return { project: parts.join("-",), accelerator, arch, };
  }
  return { project: name, accelerator: UNKNOWN, arch: UNKNOWN, };
}

/** Source ref recorded inside the prefix, or `"unknown"`. */
function readRef(dir: string,): string {
  try {
    return asText(readFileSync(join(dir, "BUILD_REF",), "utf8",).trim(),) ?? UNKNOWN;
  } catch {
    return UNKNOWN;
  }
}

function safeNames(dir: string,): string[] {
  try {
    return readdirSync(dir,);
  } catch {
    return [];
  }
}

/** Regular files and symlinks count; directories and anything unreadable do not. */
function isEntry(path: string,): boolean {
  try {
    const st = lstatSync(path,);
    return st.isFile() || st.isSymbolicLink();
  } catch {
    return false;
  }
}

function statArtifact(path: string, kind: ArtifactReport["kind"], ref: string,): ArtifactReport {
  try {
    const st = statSync(path,);
    return { path, kind, ref, size: st.size, mtime: st.mtime.toISOString(), };
  } catch {
    return { path, kind, ref, size: 0, mtime: UNKNOWN, };
  }
}

function probeVariant(dir: string,): VariantReport {
  const root = resolve(dir,);
  const named = parseName(basename(root,),);
  let info: Record<string, unknown> = {};
  try {
    info = JSON.parse(readFileSync(join(root, "build-info.json",), "utf8",),) as Record<string, unknown>;
  } catch {
    info = {};
  }
  const ref = asText(info["ref"],) ?? readRef(root,);
  const artifacts: ArtifactReport[] = [];
  const bin = join(root, "bin",);
  if (existsSync(bin,)) {
    for (const name of safeNames(bin,)) {
      const entry = join(bin, name,);
      if (isEntry(entry,)) {
        artifacts.push(statArtifact(entry, "binary", ref,),);
      }
    }
  }
  for (const lib of ["lib", "lib64",]) {
    if (!existsSync(join(root, lib,),)) {
      continue;
    }
    for (const name of safeNames(join(root, lib,),)) {
      // Follow the unversioned symlink only; stale versioned files the link
      // does not point at are never picked up by this listing.
      if (!name.endsWith(".so",)) {
        continue;
      }
      const entry = join(root, lib, name,);
      if (isEntry(entry,)) {
        artifacts.push(statArtifact(entry, "library", ref,),);
      }
    }
  }
  return {
    project: asText(info["project"],) ?? named.project,
    ref,
    accelerator: asText(info["accelerator"],) ?? named.accelerator,
    arch: asText(info["arch"],) ?? named.arch,
    root,
    artifacts,
  };
}

function looksLikeVariant(dir: string,): boolean {
  return existsSync(join(dir, "build-info.json",),) || existsSync(join(dir, "BUILD_REF",),) ||
    existsSync(join(dir, "bin",),);
}

function subdirs(dir: string,): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true, },).filter((entry,) => entry.isDirectory()).map((entry,) =>
      entry.name
    );
  } catch {
    return [];
  }
}

/** Probe each root: a variant prefix itself, or a container of variant prefixes. */
export function collectVariants(roots: string[],): VariantReport[] {
  const reports: VariantReport[] = [];
  for (const root of roots) {
    const abs = resolve(root,);
    if (looksLikeVariant(abs,)) {
      reports.push(probeVariant(abs,),);
    } else {
      for (const name of subdirs(abs,)) {
        reports.push(probeVariant(join(abs, name,),),);
      }
    }
  }
  return reports;
}

/** Human-readable listing of the reported variants. */
export function formatHuman(variants: VariantReport[],): string {
  const lines: string[] = [];
  for (const variant of variants) {
    lines.push(`${variant.project} @ ${variant.ref} [${variant.accelerator}/${variant.arch}]`,);
    lines.push(`  root: ${variant.root}`,);
    if (variant.artifacts.length === 0) {
      lines.push("  no artifacts reported",);
    }
    for (const artifact of variant.artifacts) {
      lines.push(
        `  ${artifact.kind}: ${artifact.path} (${artifact.size} bytes, ${artifact.mtime}; ref ${artifact.ref})`,
      );
    }
  }
  if (variants.length === 0) {
    lines.push("No installed variants reported.",);
  }
  lines.push(NOTE,);
  return lines.join("\n",);
}

/** Machine-readable document with the same fields. */
export function formatJson(variants: VariantReport[],): string {
  return JSON.stringify({ note: NOTE, generatedAt: new Date().toISOString(), variants, }, null, 2,);
}

export function parseArgs(argv: string[],): StatusArgs {
  let command: StatusArgs["command"] | undefined;
  const roots: string[] = [];
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "--json") {
      json = true;
    } else if (arg === "--root") {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error("Missing value for --root.",);
      }
      roots.push(value,);
      i++;
    } else if (arg.startsWith("--root=",)) {
      roots.push(arg.slice("--root=".length,),);
    } else if (arg.startsWith("--",)) {
      throw new Error(`Unknown flag ${arg}.`,);
    } else if (command === undefined) {
      if (arg !== "status" && arg !== "verify") {
        throw new Error(`Unknown subcommand ${arg}; expected "status" or "verify".`,);
      }
      command = arg;
    } else {
      roots.push(arg,);
    }
  }
  if (command === undefined) {
    throw new Error('Missing subcommand; expected "status" or "verify".',);
  }
  return { command, roots: roots.length > 0 ? roots : [".",], json, };
}

/** Run one invocation and return its stdout text. */
export function run(argv: string[],): string {
  const args = parseArgs(argv,);
  const variants = collectVariants(args.roots,);
  if (args.command === "verify" || args.json) {
    return formatJson(variants,);
  }
  return formatHuman(variants,);
}

if (import.meta.main) {
  try {
    console.log(run(process.argv.slice(2,),),);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err,);
    process.exit(2,);
  }
}
