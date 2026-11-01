// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Full text validation for `.metadata.toml` (spec §6.1) — the entry point
 * for tests and the future `loop-lore metadata validate` gate (H5). Runs the
 * same normalization machinery as the loader (fail-closed dimension rules)
 * and additionally reports linkage, secret-shape, and containment findings.
 * Never throws.
 *
 * @module project-metadata/validate
 */
import {
  normalizeContext,
  normalizeRemotes,
  normalizeSync,
} from "./access";
import { METADATA_VERSION, } from "./constants";
import {
  normalizeIdentity,
  normalizeIntegration,
  normalizeSecurity,
  normalizeShareability,
  normalizeStack,
} from "./dimensions";
import { buildMetadataItems, itemLinkageFindings, normalizeItemDecls, scanMetadataFolder, } from "./items";
import { sinkFinding, stringOr, } from "./normalize";
import type { MetadataIssueSink, } from "./normalize";
import type { MetadataEvent, MetadataFinding, } from "./types";

/** Options for {@link validateProjectMetadataText}. */
export interface ValidateProjectMetadataOptions {
  /** Scope root; enables `.metadata/` folder containment checks when given. */
  root?: string;
}

/** Typed validation outcome: findings bucketed by severity + audit events. */
export interface MetadataValidationResult {
  /** True when no error-severity findings were reported. */
  ok: boolean;
  errors: MetadataFinding[];
  warnings: MetadataFinding[];
  lints: MetadataFinding[];
  events: MetadataEvent[];
}

/** URL fragments that look like pasted credentials (spec §5.4). */
const SECRET_TOKEN_PREFIXES = ["ghp_", "gho_", "ghs_", "ghu_", "ghub_", "glpat-", "xox", "sk-",];

/** `scheme://user@host` userinfo inside a remote URL. */
const USERINFO_PATTERN = /\/\/[^/@\s]+@/;

/** Secret-shape findings for `[[remotes]]` URLs (reference-only, never secrets). */
function secretShapeFindings(sink: MetadataIssueSink, doc: Record<string, unknown>,): void {
  const remotes = doc.remotes;
  if (!Array.isArray(remotes,)) { return; }
  for (const [index, row,] of remotes.entries()) {
    if (row === null || typeof row !== "object" || Array.isArray(row,)) { continue; }
    const url = stringOr(sink, (row as Record<string, unknown>).url, "remotes.url", `remotes[${index}].url`,);
    if (url === "") { continue; }
    const pointer = `remotes[${index}].url`;
    if (USERINFO_PATTERN.test(url,)) {
      sinkFinding(
        sink,
        "error",
        "secret_shape",
        `remotes[${index}].url contains userinfo (user:pass@host form)`,
        pointer,
      );
    }

    const low = url.toLowerCase();
    for (const prefix of SECRET_TOKEN_PREFIXES) {
      if (low.includes(prefix,)) {
        sinkFinding(
          sink,
          "error",
          "secret_shape",
          `remotes[${index}].url looks like it embeds a token ("${prefix}…")`,
          pointer,
        );

        break;
      }
    }
  }
}

/**
 * Validate one manifest text.
 * @param text - Verbatim `.metadata.toml` contents.
 * @param options - Scope root for folder containment checks.
 * @returns Bucketed findings + audit events; `ok` is error-free-ness.
 */
export function validateProjectMetadataText(
  text: string,
  options: ValidateProjectMetadataOptions = {},
): MetadataValidationResult {
  const errors: MetadataFinding[] = [];
  const warnings: MetadataFinding[] = [];
  const lints: MetadataFinding[] = [];
  const events: MetadataEvent[] = [];
  const root = options.root === undefined ? null : options.root;
  const scopeRoot = root ?? "";
  const sink: MetadataIssueSink = { events, findings: [], scopeRoot, };

  let doc: unknown;
  try {
    doc = Bun.TOML.parse(text,);
  } catch (cause) {
    errors.push({
      severity: "error",
      code: "parse",
      message: `unparsable TOML: ${cause instanceof Error ? cause.message : String(cause,)}`,
    },);

    return { ok: false, errors, warnings, lints, events, };
  }

  if (doc === null || typeof doc !== "object" || Array.isArray(doc,)) {
    errors.push({ severity: "error", code: "parse", message: "manifest must parse to a table", },);
    return { ok: false, errors, warnings, lints, events, };
  }

  const parsed = doc as Record<string, unknown>;

  const version = parsed.metadata_version;
  if (version === undefined) {
    errors.push({
      severity: "error",
      code: "missing_version",
      message: "metadata_version is required",
      pointer: "metadata_version",
    },);
  } else if (typeof version !== "number" || !Number.isInteger(version,)) {
    errors.push({
      severity: "error",
      code: "invalid_version",
      message: `metadata_version must be an integer, got ${typeof version}`,
      pointer: "metadata_version",
    },);
  } else if (version > METADATA_VERSION) {
    events.push({
      type: "metadata_version_future",
      dim: "metadata_version",
      detail: `future major ${version} > supported ${METADATA_VERSION}`,
      scopeRoot,
    },);

    errors.push({
      severity: "error",
      code: "unsupported_version",
      message:
        `metadata_version ${version} is newer than supported major ${METADATA_VERSION} (fail-closed: treated as absent)`,
      pointer: "metadata_version",
    },);
  } else if (version < METADATA_VERSION) {
    errors.push({
      severity: "error",
      code: "unsupported_version",
      message: `metadata_version ${version} is older than supported major ${METADATA_VERSION}; no migration in v1`,
      pointer: "metadata_version",
    },);
  }

  normalizeIdentity(sink, parsed,);
  normalizeShareability(sink, parsed,);
  normalizeStack(sink, parsed,);
  normalizeSecurity(sink, parsed,);
  normalizeIntegration(sink, parsed,);
  normalizeRemotes(sink, parsed,);
  normalizeSync(sink, parsed,);
  normalizeContext(sink, parsed,);
  const decls = normalizeItemDecls(sink, parsed,);
  secretShapeFindings(sink, parsed,);

  const present = root === null ? [] : scanMetadataFolder(sink, root,);
  if (root === null && decls.length > 0) {
    lints.push({
      severity: "lint",
      code: "item_escape",
      message: "no root provided; .metadata/ containment could not be verified",
    },);
  }

  const linkage = itemLinkageFindings(buildMetadataItems(decls, present,),);

  for (const finding of [...sink.findings, ...linkage,]) {
    if (finding.severity === "error") { errors.push(finding,); }
    else if (finding.severity === "warning") { warnings.push(finding,); }
    else { lints.push(finding,); }
  }

  return { ok: errors.length === 0, errors, warnings, lints, events, };
}
