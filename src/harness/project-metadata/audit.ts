// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Metadata audit sink (spec §6.2 H6): one structured log line per event.
 *
 * H6 DEFERRAL NOTE — `recordToolCallAudit` (`src/assistant/guard/audit.ts`)
 * keys rows to a guarded tool call (`tool`/`chatId`/`userId`/`durationMs`) and
 * has no shape for load-time metadata events; fabricating chat/user context
 * would corrupt that table's semantics. Until a dedicated metadata-events
 * table or a tag-carrying standalone writer exists (spec §4 defers this until
 * event volume proves the need — R A5.2 `tool_call_audit.tags`), events are
 * logger-only.
 *
 * @module project-metadata/audit
 */
import { getChildLogger, type Logger, } from "../../logger";
import { loadProjectMetadata, } from "./load";
import type { MetadataEvent, } from "./types";

/** Logger source for metadata audit lines. Memoized child by default; a test
 * seam replaces it (mirrors `worktree-scope`'s `logSource` pattern). */
const defaultLogSource: () => Logger | null = () => getChildLogger("harness/project-metadata",);
let logSource: () => Logger | null = defaultLogSource;

/** Replace the metadata audit log source. Test-only seam. */
export function setMetadataLogSourceForTests(source: () => Logger | null,): void {
  logSource = source;
}

/** Reinstate the default metadata audit log source. Test-only seam. */
export function resetMetadataLogSourceForTests(): void {
  logSource = defaultLogSource;
}

/** Emit one structured warn per metadata event (no-op when silent/empty). */
export function emitMetadataEvents(events: readonly MetadataEvent[],): void {
  if (events.length === 0) { return; }
  const log = logSource();
  if (log === null) { return; }
  for (const event of events) {
    log.warn(`metadata: ${event.type}`, {
      dim: event.dim,
      detail: event.detail,
      scopeRoot: event.scopeRoot,
    },);
  }
}

/** Scope roots already audited this process — the hook runs once per root. */
const auditedRoots = new Set<string>();

/** Load one root and emit its events; NEVER rejects. */
async function auditRoot(root: string,): Promise<void> {
  try {
    const result = await loadProjectMetadata(root,);
    if (result.ok) {
      emitMetadataEvents(result.value.events,);
    } else {
      logSource()?.warn(`metadata: ${result.error.code}`, {
        scopeRoot: result.error.scopeRoot,
        detail: result.error.message,
      },);
    }
  } catch (cause) {
    // The audit hook must never change guard behavior — log and drop.
    logSource()?.debug("metadata audit hook failed", {
      scopeRoot: root,
      err: cause instanceof Error ? cause.message : String(cause,),
    },);
  }
}

/**
 * H1 detection hook: after `detectScopeRoot` resolves a root, load its
 * manifest once and emit audit events for declared policy dims. Fire-and-
 * forget (`auditRoot` is fully catching), memoized per root, and strictly
 * observability-only — no guard decision reads this path in v1.
 */
export function notifyScopeRootMetadata(root: string,): void {
  if (auditedRoots.has(root,)) { return; }
  auditedRoots.add(root,);
  void auditRoot(root,);
}

/** Forget memoized audited roots. Test-only seam. */
export function resetMetadataHookForTests(): void {
  auditedRoots.clear();
}
