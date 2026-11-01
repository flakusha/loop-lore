// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Raw parsed-TOML → typed normalization primitives, shared by the loader and
 * the validator (dimension normalizers live in `dimensions.ts`).
 * Fail-closed by dimension class (spec §1.4): unknown values in POLICY enums
 * degrade to the most restrictive valid value + audit event; unknown ADVISORY
 * entries are dropped + audit event. Type mismatches follow the same shape.
 *
 * @module project-metadata/normalize
 */
import { AUTH_CLASS_FIXED, AUTH_CLASS_PREFIXES, } from "./constants";
import type { MetadataEvent, MetadataFinding, } from "./types";

/** Collects audit events + validation findings raised during normalization. */
export interface MetadataIssueSink {
  events: MetadataEvent[];
  findings: MetadataFinding[];
  scopeRoot: string;
}

/** Record one audit event on the sink. */
export function sinkEvent(sink: MetadataIssueSink, dim: string, type: MetadataEvent["type"], detail: string,): void {
  sink.events.push({ type, dim, detail, scopeRoot: sink.scopeRoot, },);
}

/** Record one validation finding on the sink. */
export function sinkFinding(
  sink: MetadataIssueSink,
  severity: MetadataFinding["severity"],
  code: MetadataFinding["code"],
  message: string,
  pointer?: string,
): void {
  sink.findings.push({ severity, code, message, pointer, },);
}

/** One normalization option bundle (options-object convention). */
interface ScalarEnumOptions<T extends string,> {
  value: unknown;
  allowed: readonly T[];
  dim: string;
  pointer: string;
  /** Applied when the key is absent. */
  fallbackMissing: T;
  /** Applied when the value is present but unknown (most restrictive). */
  fallbackUnknown: T;
  /** Policy enums error + degrade; advisory enums warn + drop. */
  policy: boolean;
}

/** Validate one scalar enum value, fail-closed per spec §1.4. */
export function scalarEnum<T extends string,>(sink: MetadataIssueSink, opts: ScalarEnumOptions<T>,): T {
  if (opts.value === undefined) { return opts.fallbackMissing; }
  if (typeof opts.value !== "string" || !opts.allowed.includes(opts.value as T,)) {
    const seen = typeof opts.value === "string" ? opts.value : typeof opts.value;
    sinkEvent(
      sink,
      opts.dim,
      "metadata_enum_unknown",
      `unknown value "${seen}" → restrictive fallback "${opts.fallbackUnknown}" (${
        opts.policy ? "policy" : "advisory"
      })`,
    );

    sinkFinding(
      sink,
      opts.policy ? "error" : "warning",
      opts.policy ? "unknown_enum_policy" : "unknown_enum_advisory",
      `${opts.dim}: unknown value "${seen}"; using "${opts.fallbackUnknown}"`,
      opts.pointer,
    );

    return opts.fallbackUnknown;
  }

  return opts.value as T;
}

/** Validate one plain string; type mismatch → type_mismatch finding + fallback. */
export function stringOr(
  sink: MetadataIssueSink,
  value: unknown,
  dim: string,
  pointer: string,
  fallback = "",
): string {
  if (value === undefined) { return fallback; }
  if (typeof value !== "string") {
    sinkFinding(sink, "error", "type_mismatch", `${dim}: expected string, got ${typeof value}`, pointer,);
    return fallback;
  }

  return value;
}

/** Validate one boolean flag; type mismatch → type_mismatch finding + fallback. */
export function boolOr(
  sink: MetadataIssueSink,
  value: unknown,
  dim: string,
  pointer: string,
  fallback = false,
): boolean {
  if (value === undefined) { return fallback; }
  if (typeof value !== "boolean") {
    sinkFinding(sink, "error", "type_mismatch", `${dim}: expected boolean, got ${typeof value}`, pointer,);
    return fallback;
  }

  return value;
}

/** Options for {@link stringList}. */
export interface StringListOptions {
  value: unknown;
  /** Fixed lattice; null keeps any string entry (advisory free lists). */
  allowed: readonly string[] | null;
  dim: string;
  pointer: string;
  /** Policy lists error on unknown entries; advisory lists warn. */
  policy: boolean;
}

/**
 * Validate one string-array field. Unknown lattice entries are dropped with
 * an audit event (error severity when policy, warning when advisory); a
 * non-array value degrades to `[]`.
 */
export function stringList(sink: MetadataIssueSink, opts: StringListOptions,): string[] {
  if (opts.value === undefined) { return []; }
  if (!Array.isArray(opts.value,)) {
    sinkFinding(
      sink,
      "error",
      "type_mismatch",
      `${opts.dim}: expected array of strings, got ${typeof opts.value}`,
      opts.pointer,
    );

    return [];
  }

  const kept: string[] = [];
  for (const entry of opts.value) {
    if (typeof entry !== "string") {
      sinkFinding(sink, "error", "type_mismatch", `${opts.dim}: non-string entry`, opts.pointer,);
      continue;
    }

    if (opts.allowed !== null && !opts.allowed.includes(entry,)) {
      sinkEvent(
        sink,
        opts.dim,
        "metadata_enum_unknown",
        `unknown entry "${entry}" → dropped (${opts.policy ? "policy" : "advisory"})`,
      );

      sinkFinding(
        sink,
        opts.policy ? "error" : "warning",
        opts.policy ? "unknown_enum_policy" : "unknown_enum_advisory",
        `${opts.dim}: unknown entry "${entry}" dropped`,
        opts.pointer,
      );

      continue;
    }

    kept.push(entry,);
  }

  return kept;
}

/** The table value at `key`, or an empty table when absent/mistyped. */
export function tableAt(doc: Record<string, unknown>, key: string,): Record<string, unknown> {
  const value = doc[key];
  return value !== undefined && typeof value === "object" && !Array.isArray(value,)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Parse one `auth_class` shape. Fixed values come from `AUTH_CLASS_FIXED`;
 * prefixed shapes carry a reference suffix (`token-env:<VAR>`,
 * `principal:<id>`) — the suffix is a name, never a secret (spec §5.4).
 * @returns The validated shape string, or null when malformed.
 */
export function parseAuthClass(value: string,): string | null {
  if ((AUTH_CLASS_FIXED as readonly string[]).includes(value,)) { return value; }
  for (const prefix of AUTH_CLASS_PREFIXES) {
    if (!value.startsWith(prefix,)) { continue; }
    const ref = value.slice(prefix.length,);
    const ok = prefix === "token-env:"
      ? /^[A-Za-z_][A-Za-z0-9_]*$/.test(ref,)
      : /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(ref,);

    return ok ? value : null;
  }

  return null;
}
