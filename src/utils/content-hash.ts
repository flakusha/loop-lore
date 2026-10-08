// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Content hashing + dedup substrate for context injection.
 *
 * Pure, dependency-free (browser + server safe): carriage, notes, quests,
 * and provisioned memory submit entries with `{ source, id, hash }` and the
 * assembler keeps the first occurrence of each hash. No callers wired yet —
 * consumed by TASK-context-injection-dedup.
 */

/**
 * FNV-1a 32-bit hash of a string, hex-encoded.
 * Not the SHA-256 asset hash in `src/assets/` — this is a short
 * non-cryptographic dedup key for prompt assembly only.
 * @param content - content to hash (UTF-8 encoded before hashing)
 * @returns 8-char lowercase hex digest.
 */
// ponytail: 32-bit — a collision merges two distinct facts into one
// prompt block; move to 64-bit if entry counts ever reach thousands.
export function contentHash(content: string,): string {
  let hash = 0x811c9dc5;
  const bytes = new TextEncoder().encode(content,);
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, 0x01000193,);
  }

  return (hash >>> 0).toString(16,).padStart(8, "0",);
}

/** One dropped duplicate: the entry, its hash, and the kept first occurrence. */
export interface DuplicateEntry<T,> {
  entry: T;
  hash: string;
  firstIndex: number;
}

/**
 * Split entries into first-seen uniques + duplicates by content hash.
 * @param entries - entries in source-priority order (first source wins)
 * @param key - content selector hashed per entry
 * @returns `{ unique, duplicates }` — same fact from two systems injected once.
 */
export function dedupeByHash<T,>(
  entries: readonly T[],
  key: (entry: T,) => string,
): { unique: T[]; duplicates: DuplicateEntry<T>[] } {
  const seen = new Map<string, number>();
  const unique: T[] = [];
  const duplicates: DuplicateEntry<T>[] = [];
  for (const entry of entries) {
    const hash = contentHash(key(entry,),);
    const firstIndex = seen.get(hash,);
    if (firstIndex === undefined) {
      seen.set(hash, unique.length,);
      unique.push(entry,);
    } else {
      duplicates.push({ entry, hash, firstIndex, },);
    }
  }

  return { unique, duplicates, };
}
