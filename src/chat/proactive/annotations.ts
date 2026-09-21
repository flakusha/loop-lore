// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Proactive Annotations — GM-style in-chat annotations.
 *
 * Vertical slice for `TASK-chat-feature-notes-shadow-carriage`:
 *   - `createAnnotation` returns a typed annotation object with a
 *     discriminator (note/shadow/quest) and an optional TTL window.
 *   - Persisted annotations go to `shadow_notes` when kind === "shadow"
 *     (the existing GM table). `note` and `quest` annotations live in
 *     an in-memory store keyed by id; they're cheap to recreate.
 *
 * The TTL helper is pure so callers can decide expiry semantics.
 */

import type { Kysely, } from "kysely";
import { ShadowNoteStatus, ShadowNoteType, } from "../../db/enums-gm";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";
import { parseExpiryMs, } from "../../utils/date";

/** Annotation kinds carried by GM-style chat annotations. */
export type AnnotationKind = "note" | "shadow" | "quest";

const VALID_KINDS: readonly AnnotationKind[] = ["note", "shadow", "quest",];

/** Persisted/in-memory annotation view returned to the caller. */
export interface Annotation {
  id: string;
  chatId: string;
  actorId: string;
  kind: AnnotationKind;
  body: string;
  createdAt: string;
  /** ISO timestamp; null when ttlMs was not supplied. */
  ttlUntil: string | null;
}

export interface CreateAnnotationInput {
  chatId: string;
  kind: AnnotationKind;
  actorId: string;
  body: string;
  /** TTL window in milliseconds; omission yields a non-expiring annotation. */
  ttlMs?: number;
}

/** Map of annotation id → in-memory annotation, scoped per process. */
const memoryStore = new Map<string, Annotation>();

/** Lookup annotations created in-process (kind=note|quest). */
export function listMemoryAnnotations(chatId: string,): Annotation[] {
  const out: Annotation[] = [];
  for (const a of memoryStore.values()) {
    if (a.chatId === chatId) { out.push(a,); }
  }
  return out;
}

/** Reset the in-memory store (test helper). */
export function clearMemoryAnnotations(): void {
  memoryStore.clear();
}

/**
 * Determine whether an annotation has passed its TTL window at `now`.
 * @param annotation
 * @param now
 */
export function isAnnotationExpired(
  annotation: Annotation,
  now: Date = new Date(),
): boolean {
  if (annotation.ttlUntil === null) { return false; }
  return new Date(annotation.ttlUntil,).getTime() <= now.getTime();
}

/**
 * Create a new annotation. Shadow-kind annotations persist to
 * `shadow_notes`; the other kinds live in memory for the bounded
 * vertical slice (no schema exists for note/quest annotations yet).
 * @param db
 * @param input
 * @returns The created annotation.
 */
export async function createAnnotation(
  db: Kysely<DB>,
  input: CreateAnnotationInput,
): Promise<Annotation> {
  if (!VALID_KINDS.includes(input.kind,)) {
    throw new Error(`Invalid annotation kind: ${input.kind}`,);
  }
  const createdAt = new Date().toISOString();
  const ttlUntil = typeof input.ttlMs === "number" && input.ttlMs > 0
    ? new Date((parseExpiryMs(createdAt,) ?? 0) + input.ttlMs,).toISOString()
    : null;

  const annotation: Annotation = {
    id: uid(),
    chatId: input.chatId,
    actorId: input.actorId,
    kind: input.kind,
    body: input.body,
    createdAt,
    ttlUntil,
  };

  if (input.kind === "shadow") {
    await db
      .insertInto("shadow_notes",)
      .values({
        id: annotation.id,
        chat_id: annotation.chatId,
        type: ShadowNoteType.HiddenFact,
        content: annotation.body,
        status: ShadowNoteStatus.Hidden,
        created_at: annotation.createdAt,
        // Extraction-pipeline writes are tagged as "extracted" so the
        // GM panel + audit row can distinguish platform-derived notes
        // from human-authored ones. TTL flows through too.
        author_type: "extracted" as never,
        expires_at: annotation.ttlUntil,
      },)
      .execute();
    return annotation;
  }

  memoryStore.set(annotation.id, annotation,);
  return annotation;
}
