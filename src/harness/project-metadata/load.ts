// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Project metadata manifest loader (spec §1, §2).
 *
 * Locates `.metadata.toml` at the scope root (falling back to the main-repo
 * manifest when running inside a worktree, `findMainRepoRoot`), parses it
 * with Bun's TOML parser (the repo's config-layer parser), gates on
 * `metadata_version` fail-closed, normalizes every dimension, validates the
 * `.metadata/` folder (USER-APPROVED 2026-11-01 extension), and merges the
 * worktree layer so it can only NARROW the main repo's declared policy
 * (spec §1.2–§1.3).
 *
 * Never throws: every outcome is a `MetadataLoadResult`. The loader degrades
 * (most-restrictive values + audit events) instead of failing on policy
 * problems; hard failures (unreadable file, unparsable TOML, unusable
 * version) are `MetadataError` results.
 *
 * @module project-metadata/load
 */
import { existsSync, readFileSync, } from "node:fs";
import { basename, join, resolve, } from "node:path";
import { findMainRepoRoot, } from "../../utils/git-worktree";
import {
  normalizeContext,
  normalizeRemotes,
  normalizeSync,
} from "./access";
import { METADATA_VERSION, type MetadataSource, } from "./constants";
import {
  normalizeIdentity,
  normalizeIntegration,
  normalizeSecurity,
  normalizeShareability,
  normalizeStack,
} from "./dimensions";
import { buildMetadataItems, normalizeItemDecls, scanMetadataFolder, } from "./items";
import type { MetadataIssueSink, } from "./normalize";
import { mergeWorktreeNarrowing, } from "./resolve";
import { DEFAULT_METADATA, } from "./types";
import type { MetadataEvent, MetadataFinding, ResolvedProjectMetadata, } from "./types";

/** Manifest file name at the scope root. */
export const METADATA_FILE = ".metadata.toml";

/** Hard load failure — fail-closed (spec §1.4); the caller treats this as absent. */
export interface MetadataError {
  code: "parse" | "io" | "missing_version" | "invalid_version" | "unsupported_version";
  message: string;
  scopeRoot: string;
  /** Underlying read/parse error when applicable. */
  cause?: unknown;
}

/** Discriminated loader outcome. */
export type MetadataLoadResult =
  | { ok: true; value: ResolvedProjectMetadata }
  | { ok: false; error: MetadataError };

/** Options for {@link loadProjectMetadata}. */
export interface LoadProjectMetadataOptions {
  /**
   * Main-repo root override. Defaults to `findMainRepoRoot(root)`; pass null
   * to treat `root` as the main repo regardless of worktree status.
   */
  mainRoot?: string | null;
}

/**
 * Load + resolve the project metadata manifest for one scope root.
 *
 * Absent-everywhere → `DEFAULT_METADATA` (spec §2) with `source: "default"`.
 * A future major version is treated as absent + `metadata_version_future`
 * event; a lesser major fails closed (no silent migration in v1).
 * @param root - Scope root (git worktree toplevel).
 * @param options - Main-root override, see {@link LoadProjectMetadataOptions}.
 * @returns Resolved manifest, or a typed `MetadataError`.
 */
export async function loadProjectMetadata(
  root: string,
  options: LoadProjectMetadataOptions = {},
): Promise<MetadataLoadResult> {
  const scopeRoot = resolve(root,);
  const detectedMain = options.mainRoot === undefined ? findMainRepoRoot(scopeRoot,) : options.mainRoot;
  const mainRoot = detectedMain === null ? null : resolve(detectedMain,);

  if (mainRoot === null || mainRoot === scopeRoot) {
    return loadManifestAt(scopeRoot, "main",);
  }

  const main = loadManifestAt(mainRoot, "main",);
  if (!main.ok) { return main; }
  const worktree = loadManifestAt(scopeRoot, "worktree",);
  if (!worktree.ok) { return worktree; }
  return { ok: true, value: mergeWorktreeNarrowing(main.value, worktree.value,), };
}

/** Absent-file resolution: spec §2 defaults anchored to one scope root. */
function defaultResolution(
  root: string,
  source: MetadataSource,
  extras: {
    events?: MetadataEvent[];
    findings?: MetadataFinding[];
    rawText?: string | null;
    parsed?: Record<string, unknown> | null;
  } = {},
): ResolvedProjectMetadata {
  return {
    ...DEFAULT_METADATA,
    source,
    scopeRoot: root,
    identity: { ...DEFAULT_METADATA.identity, id: basename(root,), },
    events: extras.events ?? [],
    findings: extras.findings ?? [],
    rawText: extras.rawText ?? null,
    parsed: extras.parsed ?? null,
  };
}

/** Read + parse + gate + normalize one root's manifest (sync core). */
function loadManifestAt(root: string, source: MetadataSource,): MetadataLoadResult {
  const file = join(root, METADATA_FILE,);
  const sink: MetadataIssueSink = { events: [], findings: [], scopeRoot: root, };

  if (!existsSync(file,)) {
    // Absent toml → treated as absent-everywhere: source "default" (mission
    // contract). The folder extension still applies at this root, so the
    // scan's events/findings ride along.
    const present = scanMetadataFolder(sink, root,);
    return {
      ok: true,
      value: {
        ...defaultResolution(root, "default", { events: sink.events, findings: sink.findings, },),
        items: buildMetadataItems([], present,),
      },
    };
  }

  let text: string;
  try {
    text = readFileSync(file, "utf8",);
  } catch (cause) {
    return { ok: false, error: { code: "io", message: `unreadable ${METADATA_FILE}`, scopeRoot: root, cause, }, };
  }

  let doc: unknown;
  try {
    doc = Bun.TOML.parse(text,);
  } catch (cause) {
    return { ok: false, error: { code: "parse", message: `unparsable ${METADATA_FILE}`, scopeRoot: root, cause, }, };
  }

  if (doc === null || typeof doc !== "object" || Array.isArray(doc,)) {
    return {
      ok: false,
      error: { code: "parse", message: `${METADATA_FILE} must parse to a table`, scopeRoot: root, },
    };
  }

  const parsed = doc as Record<string, unknown>;

  const gate = gateVersion(parsed.metadata_version,);
  if (gate.action === "error") { return { ok: false, error: { ...gate.error, scopeRoot: root, }, }; }
  if (gate.action === "future") {
    // Greater major → treat the whole file as absent + audit event (spec §1.4).
    // Policy values are the defaults; rawText/parsed stay available for triage.
    return {
      ok: true,
      value: defaultResolution(root, "default", {
        events: [{
          type: "metadata_version_future",
          dim: "metadata_version",
          detail: `manifest declares major ${
            String(gate.declared,)
          } > supported ${METADATA_VERSION}; treated as absent`,
          scopeRoot: root,
        },],
        rawText: text,
        parsed,
      },),
    };
  }

  const identity = normalizeIdentity(sink, parsed,);
  const decls = normalizeItemDecls(sink, parsed,);
  const present = scanMetadataFolder(sink, root,);
  return {
    ok: true,
    value: {
      metadataVersion: METADATA_VERSION,
      source,
      scopeRoot: root,
      identity,
      shareability: normalizeShareability(sink, parsed,),
      stack: normalizeStack(sink, parsed,),
      security: normalizeSecurity(sink, parsed,),
      integration: normalizeIntegration(sink, parsed,),
      remotes: normalizeRemotes(sink, parsed,),
      sync: normalizeSync(sink, parsed,),
      context: normalizeContext(sink, parsed,),
      items: buildMetadataItems(decls, present,),
      events: sink.events,
      findings: sink.findings,
      rawText: text,
      // Unknown/vendor keys preserved: raw text + full parsed overlay.
      parsed,
    },
  };
}

/** Version-gate outcome for one parsed manifest. */
type VersionGate =
  | { action: "proceed" }
  | { action: "future"; declared: number }
  | { action: "error"; error: Omit<MetadataError, "scopeRoot"> };

/** Fail-closed `metadata_version` gate (spec §1.4); v1 supports only major 1. */
function gateVersion(value: unknown,): VersionGate {
  if (value === undefined) {
    return {
      action: "error",
      error: { code: "missing_version", message: "metadata_version is required when the file exists", },
    };
  }

  if (typeof value !== "number" || !Number.isInteger(value,)) {
    return {
      action: "error",
      error: { code: "invalid_version", message: `metadata_version must be an integer, got ${typeof value}`, },
    };
  }

  if (value > METADATA_VERSION) {
    return { action: "future", declared: value, };
  }

  if (value < METADATA_VERSION) {
    return {
      action: "error",
      error: {
        code: "unsupported_version",
        message: `metadata_version ${value} is older than the supported major ${METADATA_VERSION}; no migration in v1`,
      },
    };
  }

  return { action: "proceed", };
}
