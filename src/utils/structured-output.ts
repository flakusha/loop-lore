// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Structured LLM output healing — heal → validate → size-check → approve.
 *
 * Consumed first by the hidden carriage TOML block
 * (`epic-hidden-carriage-context`), designed for reuse by quest, note, and
 * scene-transition payloads. Contract (normative per epic):
 *
 * - Deterministic healing: salvage the largest parseable prefix/document,
 *   closing truncated tables/arrays. Never throws.
 * - Schema revalidation against a caller-supplied predicate after healing.
 * - Byte/size cap: oversize input always cancels, never truncates silently.
 * - Explicit approve-or-cancel return: invalid or oversize input cancels
 *   with a reason code and a dev-visible hint, never a silent partial.
 */

import { load as yamlLoad, } from "js-yaml";
import { contentHash, } from "./content-hash";
import { safeJsonParse, } from "./safe-json";

/** Structured formats the healing pipeline supports. */
export type StructuredFormat = "json" | "toml" | "yaml";

/** Machine-readable cancel reason. */
export type HealingCancelReason =
  | "oversize"
  | "unparseable"
  | "schema_violation";

/** Healing outcome — approved payload or a cancel with a reason + hint. */
export type HealingResult<T,> =
  | { ok: true; value: T; healed: boolean; hash: string }
  | { ok: false; reason: HealingCancelReason; hint: string };

/** Options for {@link healStructuredOutput}. */
export interface HealOptions<T,> {
  /** Declared format of the raw text. */
  format: StructuredFormat;
  /** Raw model output to heal. */
  raw: string;
  /** Max accepted byte length (UTF-8). Oversize always cancels. */
  maxBytes: number;
  /** Schema predicate run against the parsed value (pre- AND post-heal). */
  validate: (value: unknown,) => value is T;
  /** Hint appended when validation fails (e.g. carriage repair guidance). */
  repairHint?: string;
}

/** Default carriage cap: 8 KiB — a flat episode block is a few hundred bytes. */
export const DEFAULT_CARRIAGE_MAX_BYTES = 8 * 1024;

/**
 * Parse `raw` in `format`. Never throws — null on any failure.
 * @param raw - raw text
 * @param format - declared format
 * @returns parsed value or null
 */
function tryParse(raw: string, format: StructuredFormat,): unknown | null {
  const text = raw.trim();
  if (!text) { return null; }
  try {
    if (format === "json") {
      const parsed = safeJsonParse<unknown>(text,);
      return parsed.ok ? parsed.value : null;
    }

    if (format === "yaml") { return yamlLoad(text,) as unknown; }
    return Bun.TOML.parse(text,) as unknown;
  } catch {
    return null;
  }
}

/**
 * Salvage the largest parseable prefix of `raw` by trimming trailing lines.
 * Line-granular (not char-granular) so a cut never splits a key mid-token
 * differently on retry — deterministic for the same input.
 * @param raw - raw text
 * @param format - declared format
 * @returns the healed parse or null when nothing parses
 */
function salvagePrefix(raw: string, format: StructuredFormat,): unknown | null {
  const lines = raw.split("\n",);
  for (let end = lines.length - 1; end > 0; end--) {
    const candidate = lines.slice(0, end,).join("\n",);
    const parsed = tryParse(candidate, format,);
    if (parsed !== null && parsed !== undefined) { return parsed; }
  }

  return null;
}

/**
 * Heal → validate → size-check → approve-or-cancel.
 * Order is deliberate: the byte cap runs before parsing so a hostile
 * oversize blob can never buy parse time; healing runs before the second
 * validation so truncated-but-salvageable output still approves.
 * @param opts - format, raw text, byte cap, schema predicate
 * @returns approved value or a cancel with reason + dev-visible hint
 */
export function healStructuredOutput<T,>(opts: HealOptions<T>,): HealingResult<T> {
  const { format, raw, maxBytes, validate, repairHint, } = opts;
  if (new TextEncoder().encode(raw,).length > maxBytes) {
    return {
      ok: false,
      reason: "oversize",
      hint: `Payload exceeds the ${maxBytes}-byte cap; regenerate a smaller document instead of truncating.`,
    };
  }

  const direct = tryParse(raw, format,);
  if (direct !== null && validate(direct,)) {
    return { ok: true, value: direct, healed: false, hash: contentHash(raw,), };
  }

  const salvaged = salvagePrefix(raw, format,);
  if (salvaged !== null && validate(salvaged,)) {
    return { ok: true, value: salvaged, healed: true, hash: contentHash(raw,), };
  }

  if (direct !== null || salvaged !== null) {
    return {
      ok: false,
      reason: "schema_violation",
      hint: repairHint ?? "Parsed output failed schema validation; regenerate against the declared shape.",
    };
  }

  return {
    ok: false,
    reason: "unparseable",
    hint: repairHint ?? `No parseable ${format} prefix found; regenerate a complete document.`,
  };
}

/** Minimal structural predicate for the canonical carriage TOML shape. */
export interface CarriageDoc {
  episode?: number;
  title?: string;
  setting?: string;
  characters?: { name: string; status: string }[];
}

/**
 * Validate a parsed carriage document: `[[characters]]` array-of-tables is
 * canonical (name + status per entry); the flat `characters = [...]` string
 * list form is rejected with a repair hint.
 * @param value - parsed document
 * @returns true for the canonical shape
 */
export function isCarriageDoc(value: unknown,): value is CarriageDoc {
  if (typeof value !== "object" || value === null) { return false; }
  const doc = value as Record<string, unknown>;
  if (doc.characters === undefined) { return true; }
  if (!Array.isArray(doc.characters,)) { return false; }
  return doc.characters.every(
    (c,) =>
      typeof c === "object" && c !== null &&
      typeof (c as Record<string, unknown>).name === "string" &&
      typeof (c as Record<string, unknown>).status === "string",
  );
}

/** Repair hint for the flat character-list form (see epic §Scope). */
export const CARRIAGE_REPAIR_HINT =
  "Character state must be [[characters]] array-of-tables (name + status per entry), never a flat characters = [...] string list.";

/**
 * Run the carriage gate: heal → validate → size-check → approve-or-cancel.
 * @param raw - raw carriage TOML
 * @param maxBytes - byte cap
 * @returns approved doc or a cancel with reason + hint
 */
export function healCarriage(
  raw: string,
  maxBytes: number = DEFAULT_CARRIAGE_MAX_BYTES,
): HealingResult<CarriageDoc> {
  return healStructuredOutput({
    format: "toml",
    raw,
    maxBytes,
    validate: isCarriageDoc,
    repairHint: CARRIAGE_REPAIR_HINT,
  },);
}
