// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Canonical record hash (ticket 1 / `epic-content-hashing-distributed-integrity`).
 *
 * The `record_hash` is a row-integrity digest, NOT a duplicate-detection hash
 * (the latter is `assets.content_hash`, a SHA-256 of the raw bytes — see
 * `src/assets/service/create.ts:14-26`). The two serve different jobs:
 *
 *   - `content_hash` answers "have these bytes been uploaded before?" (per-owner
 *     dedup; TOCTOU-sensitive — closed by the UNIQUE index on ticket 4).
 *   - `record_hash` answers "has this row drifted from the canonical projection
 *     of its content-defining columns?" (row integrity; cross-layer anchor).
 *
 * The envelope is a deterministic concatenation of three parts:
 *
 *   `record_hash = SHA-256( table_name + "|" + pk_value + "|" + canonicalJSON(hash_inputs) )`
 *
 * `canonicalJSON` sorts object keys at every level and emits no padding. The
 * envelope version (`RECORD_HASH_VERSION`) is the migration escape hatch —
 * bumping `v` recomputes every row's hash and lets the backfill ticket run
 * safely in waves. See the ticket's "Notes" section for the rationale.
 *
 * SHA-256 is implemented via Bun.CryptoHasher (verified byte-identical to
 * node:crypto.createHash("sha256") — see Bun runtime adoption batch 2026-08-27
 * in Engram). The function accepts any JSON-serializable payload; `TableName`
 * is branded to prevent accidental inter-table hash collisions.
 *
 * @module hash/record-hash
 * @see TASK-middleware-fe-be-db-record-content-hashing.md
 * @see epic-content-hashing-distributed-integrity.md
 */

/** Branded canonical table identifier (lowercase Kysely table name). */
export type TableName = string & { readonly __brand: "TableName" };

/**
 * Assert + brand a table name. Lowercase ASCII; reject leading/trailing
 * whitespace to keep the envelope unambiguous.
 *
 * @param value - Raw table name (typically `database` table literal).
 * @returns Branded TableName.
 */
export function asTableName(value: string,): TableName {
  if (value.length === 0) { throw new Error("record-hash: empty table name",); }
  if (value !== value.toLowerCase()) {
    throw new Error(`record-hash: table name must be lowercase: ${value}`,);
  }
  return value as TableName;
}

/**
 * Current envelope version. Bump this when the canonical JSON shape
 * changes (e.g. a tracked column is added to a table). Hash mismatches
 * after a bump are EXPECTED — the backfill ticket recomputes every row.
 */
export const RECORD_HASH_VERSION = 1 as const;

/**
 * Canonical JSON: sorted keys at every level, no whitespace. The canonical
 * form is what the envelope signs; column ordering or formatting MUST NOT
 * change the hash.
 *
 * Implementation notes:
 *   - Uses a stack-allocated object scanner (no recursive depth limit).
 *   - Arrays preserve order (semantically meaningful — message bodies,
 *     metadata lists, etc.).
 *   - Special-cases `null` to emit literal `null`, not `undefined`.
 *   - Falls back to a deterministic string coercion of unknown values
 *     (e.g. `Date` → ISO string) so two equal-but-different-type payloads
 *     still hash differently. Callers SHOULD pre-conform to plain JSON.
 *
 * @param value - JSON-serializable payload (objects, arrays, primitives).
 * @returns Stable string with no whitespace, sorted object keys.
 */
export function canonicalJSON(value: unknown,): string {
  return canonicalize(value, new Set(),);
}

function canonicalize(value: unknown, seen: Set<object>,): string {
  if (value === null) { return "null"; }
  if (value === undefined) { return "null"; }
  const t = typeof value;
  if (t === "boolean") { return value ? "true" : "false"; }
  if (t === "number") {
    if (!Number.isFinite(value as number,)) { return "null"; }
    return JSON.stringify(value,);
  }
  if (t === "string") { return JSON.stringify(value,); }
  if (t === "bigint") {
    // JSON.stringify throws on BigInt; coerce deterministically.
    return JSON.stringify(value.toString(),);
  }
  if (value instanceof Date) { return JSON.stringify(value.toISOString(),); }
  if (Array.isArray(value,)) {
    if (seen.has(value,)) {
      throw new Error("record-hash: cyclic array reference",);
    }
    seen.add(value,);
    const parts: string[] = [];
    for (const item of value) { parts.push(canonicalize(item, seen,),); }
    seen.delete(value,);
    return "[" + parts.join(",",) + "]";
  }
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj,)) {
      throw new Error("record-hash: cyclic object reference",);
    }
    seen.add(obj,);
    const keys = Object.keys(obj,).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const v = obj[key];
      // Skip undefined values to match JSON.stringify semantics.
      if (v === undefined) { continue; }
      parts.push(JSON.stringify(key,) + ":" + canonicalize(v, seen,),);
    }
    seen.delete(obj,);
    return "{" + parts.join(",",) + "}";
  }
  // Functions, symbols, etc. — coerce to null to keep the envelope unambiguous.
  return "null";
}

/**
 * Compute the canonical `record_hash` for a row.
 *
 * @param table - Canonical table name (use `asTableName` to brand it).
 * @param pk - Primary key value (UUID or other string id).
 * @param hashInputs - The content projection. The `v` key inside this object
 *   MUST match `RECORD_HASH_VERSION` — we wrap the caller-supplied object
 *   to guarantee version stamping.
 * @returns Lowercase 64-char hex digest.
 */
export function computeRecordHash(
  table: TableName,
  pk: string,
  hashInputs: Record<string, unknown>,
): string {
  const envelope = `${table}|${pk}|${canonicalJSON({ v: RECORD_HASH_VERSION, ...hashInputs, },)}`;
  return new Bun.CryptoHasher("sha256",).update(envelope,).digest("hex",);
}

/**
 * Quick non-cryptographic digest for in-process keying (e.g. mapping a
 * `(route, method, requestId)` triple to a Map slot without storing the
 * full tuple). Uses Bun.hash (wyhash) which is NOT collision-resistant
 * against adversarial input — DO NOT use this for security.
 *
 * @param parts - Components to concatenate; joined by `|`.
 * @returns 64-bit unsigned integer as a string.
 */
export function fastKeyHash(...parts: string[]): string {
  return Bun.hash(parts.join("|",),).toString();
}
