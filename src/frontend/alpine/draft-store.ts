// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Framework-agnostic keyed draft persistence.
 *
 * MRU/LRU-evicting storage-backed store for short-lived text drafts
 * (composer text, editable fields, …). Blank text removes the entry, quota
 * errors are swallowed, and a corrupt index reads as empty. Distinct from
 * `composer-pre-send/draft-codec.ts`, which is TTL-keyed per-chat.
 */
import { parseExpiryMs, toDate, } from "../../utils/date";
import { jsonParseOr, safeJsonStringify, } from "./json";

/** Minimal storage surface so tests can inject an in-memory fake. */
export interface DraftStore {
  getItem(key: string,): string | null;
  setItem(key: string, value: string,): void;
  removeItem(key: string,): void;
}

/** Draft payload. */
export interface ComposerDraft {
  text: string;
  savedAt: string;
}

/** Options for {@link createKeyedDraftStore}. */
export interface KeyedDraftStoreOptions {
  /** Storage key prefix; the entry id is appended verbatim. */
  prefix: string;
  /** Storage key of the MRU id index. */
  indexKey: string;
  /** Longest text kept per draft; longer input is truncated. */
  maxChars?: number;
  /** Most entries retained; older ones are evicted. */
  maxEntries?: number;
  /** Optional expiry; reads past this age return null. */
  ttlMs?: number;
  /** Backing storage; required for the methods to do anything. */
  storage?: DraftStore | null;
  /** Clock seam for tests; defaults to `Date.now`. */
  now?: () => number;
}

/** Store surface returned by {@link createKeyedDraftStore}. */
export interface KeyedDraftStore {
  key(id: string,): string;
  readIndex(): string[];
  read(id: string,): ComposerDraft | null;
  write(id: string, text: string,): void;
  clear(id: string,): void;
}

const DEFAULT_MAX_CHARS = 10 * 1024;
const DEFAULT_MAX_ENTRIES = 20;

/**
 * @param opts
 * @returns A keyed draft store bound to the given storage and limits.
 */
export function createKeyedDraftStore(opts: KeyedDraftStoreOptions,): KeyedDraftStore {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const now = opts.now ?? Date.now;

  // Resolved per call so a storage seam injected after construction (or a
  // browser ambient localStorage appearing later) is honored everywhere.
  const storage = (): DraftStore | null => opts.storage ?? null;

  function key(id: string,): string {
    return `${opts.prefix}${id}`;
  }

  function readIndex(): string[] {
    const store = storage();
    if (!store) { return []; }
    const raw = store.getItem(opts.indexKey,);
    if (!raw) { return []; }
    const parsed = jsonParseOr<unknown>(raw, [],);
    if (!Array.isArray(parsed,)) { return []; }
    return parsed.filter((id,): id is string => typeof id === "string");
  }

  function read(id: string,): ComposerDraft | null {
    const store = storage();
    if (!store) { return null; }
    const raw = store.getItem(key(id,),);
    if (!raw) { return null; }
    const parsed = jsonParseOr<unknown>(raw, null,);
    if (typeof parsed !== "object" || parsed === null) { return null; }
    const record = parsed as Record<string, unknown>;
    const text = record.text;
    if (typeof text !== "string" || text === "") { return null; }
    const savedAt = typeof record.savedAt === "string"
      ? record.savedAt
      : toDate(now(),).toISOString();

    if (opts.ttlMs !== undefined) {
      const stamp = parseExpiryMs(savedAt,);
      if (stamp !== null && now() - stamp > opts.ttlMs) { return null; }
    }

    return { text, savedAt, };
  }

  function clear(id: string,): void {
    const store = storage();
    if (!store) { return; }
    try {
      store.removeItem(key(id,),);
    } catch {
      return;
    }

    try {
      const index = readIndex().filter((entry,) => entry !== id);
      const encoded = safeJsonStringify(index,);
      if (encoded.ok) { store.setItem(opts.indexKey, encoded.value,); }
    } catch {
      /* index loss only forfeits LRU order */
    }
  }

  function write(id: string, text: string,): void {
    const store = storage();
    if (!store) { return; }
    const trimmed = text.slice(0, maxChars,);
    if (trimmed === "") {
      clear(id,);
      return;
    }

    const payload = safeJsonStringify({ text: trimmed, savedAt: toDate(now(),).toISOString(), },);
    if (!payload.ok) { return; }
    try {
      store.setItem(key(id,), payload.value,);
    } catch {
      return;
    }

    const index = readIndex().filter((entry,) => entry !== id);
    index.unshift(id,);
    for (const evicted of index.slice(maxEntries,)) {
      try {
        store.removeItem(key(evicted,),);
      } catch {
        /* keep evicting the rest */
      }
    }

    const encoded = safeJsonStringify(index.slice(0, maxEntries,),);
    if (!encoded.ok) { return; }
    try {
      store.setItem(opts.indexKey, encoded.value,);
    } catch {
      /* index loss only forfeits LRU order */
    }
  }

  return { key, readIndex, read, write, clear, };
}
