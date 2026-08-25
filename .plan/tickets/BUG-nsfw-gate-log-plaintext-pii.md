<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: NSFW gate `logNsfwEvent` writes plaintext PII (userId/chatId/reason) to `log_entries`; accessible to all admin readers

**Status:** [OK] Resolved
**Severity:** High
**Priority:** high
**Effort:** Small
**Area:** moderation, nsfw, audit, privacy, pii
**Epic:** epic-nsfw-moderation-priority
**Tags:** nsfw, gate, audit, privacy, log-entries, pii
**Source:** OpenAgent admin/moderation direct-DB listing review (2026-08-23)
**Related:** `BUG-nsfw-gate-not-logged.md` (same hook, different defect — `logNsfwEvent` is never invoked), `TASK-nsfw-gate-moderation-events.md` (governing ticket), `BUG-admin-audit-selectAll-schema-mismatch-empty.md` (same `log_entries` surface), `BUG-nsfw-moderation-delete-destroys-audit-log.md` (audit-trust family)

## Summary

`logNsfwEvent` (`src/middleware/nsfw-gate/logging.ts:15-58`) writes
plaintext `user_id`, `chat_id`, free-form `reason`, and arbitrary
`metadata` to `log_entries`. The schema permits any caller with
`admin.system` (or anyone with DBA access) to read every NSFW gate
decision — including which chats triggered warnings — reconstructing
a user's NSFW browsing pattern.

The function is **not currently invoked from production paths** (no
caller grep'd in `src/`); it is a latent defect. But the function
signature accepts a free-form `reason` string and arbitrary
`metadata: Record<string, unknown>` — exactly the surface that will
leak the moment a caller wires it up.

## Evidence

| File | Line | Issue |
| --- | --- | --- |
| `src/middleware/nsfw-gate/logging.ts` | 15-58 | `logNsfwEvent` — entire function |
| `src/middleware/nsfw-gate/logging.ts` | 27-50 | `database.insertInto("log_entries").values({...})` with plaintext `user_id`, `entity_id` (chat id), `action`, `meta` (stringified JSON), and free-text `reason` |
| `src/middleware/nsfw-gate/logging.ts` | 28 | `log.info(... , { event })` — also passes the full `event` object to the structured logger (file/logs) |
| `src/db/migrations/005_utility_tables.ts` | 28-45 | `log_entries` schema: `id`, `level`, `timestamp`, `time`, `message`, `module`, `user_id`, `session_id`, `request_id`, `meta`, `event_type`, `entity_type`, `entity_id`, `action`, `created_at` |
| `src/routes/admin/audit.ts` | 17-85 | `GET /api/admin/audit` returns `selectAll()` from `log_entries` with `event_type` / `user_id` / `entity_type` filters — admin reads everything stored |
| `src/chat/types/nsfw.ts` | 73-79 | `NsfwAuditEventType` union includes `nsfw.gate.checked/blocked/allowed` — these are the event types callers will emit |
| `src/generation/hooks/nsfw-hook.ts` | (whole file) | `process()` returns hook results without invoking `logNsfwEvent()` — confirms the function is dormant |

Auth: none on `logNsfwEvent` — it accepts a `database: Kysely<DB>`
handle and writes whatever the caller supplies. The audit read
gate is `can(ctx.userRole, "admin.system")` only.

## Impact

- **NSFW browsing-pattern reconstruction**: every "blocked" /
  "warning" / "allowed" decision — including the `reason` — is
  recorded. Admin or DBA with read access can reconstruct which
  chats a user triggered warnings on.
- **Future-call hazard**: because the function is dormant but
  ready, wiring it up to the nsfw hook (the obvious next step)
  would immediately start writing plaintext PII with no migration
  and no redaction layer.
- **Logger-side echo**: `log.info(... , { event })` at line 28
  re-emits the full event object (userId, actorId, chatId,
  metadata) to the structured logger, doubling the exposure
  surface (DB + log files).
- **Reason-string free-text**: `reason` is free-form; callers may
  write the LLM prompt fragment that triggered the gate failure,
  which is a separate PII leak.

## Fix

1. **Enum-only `reason`**: change the `reason` field type from
   `string` to a `NsfwGateReason` union (derive from
   `NsfwAuditEventType`):
   `"consent_missing" | "rating_exceeded" | "blocked_by_chat" |
    "blocked_by_world" | "blocked_by_user_pref" |
    "explicit_content_detected" | "user_override_disabled" |
    "admin_emergency_block"`. Reject unknown reasons.
2. **Hash `user_id` and `entity_id`** before persisting unless
   `metadata.audit: true` is set explicitly. Use a server-side
   rotating HMAC secret; the hash is stable for correlation but
   does not expose the raw user/chat id.
3. **Strip known-PII keys from `metadata`**: redact
   `promptFragment`, `userMessage`, `contentText`, `errorStack`,
   any key ending in `Content`, `Message`, `Text`. Allowlist the
   rest.
4. **Restrict log_entries reads**: introduce a new
   `admin.audit.nsfw` capability. Only admins with that capability
   see NSFW gate events; everyone else sees event_type only.
   `GET /api/admin/audit` already filters; gate events need their
   own projection (counts + module + reason enum, no user_id).
5. **Drop the structured-log echo**: remove `log.info(... , {
   event })` at line 28; replace with a single
   `log.info("NSFW gate decision", { decisionType, hash, reason })`
   — same data shape on file/DB, no plaintext PII.
6. **Add a length cap on `metadata`**: 1 KiB max; reject anything
   larger.

## Verification

- Unit: `logNsfwEvent` invoked with `reason: "free-form prompt
  leak"` returns 400 / throws. With `user_id: "raw-uuid"`, the
  persisted row's `user_id` is the hash, not the raw uuid.
- Integration: invoke `logNsfwEvent` from a stub caller;
  `SELECT user_id FROM log_entries WHERE event_type =
  'nsfw.gate.blocked'` returns a hash, not a raw user id. Raw
  uuid is unrecoverable without the HMAC secret.
- Manual: open DevTools → Network as admin without
  `admin.audit.nsfw`, hit `/api/admin/audit?event_type=nsfw.*`;
  response body contains no NSFW gate events.

## Acceptance Criteria

- [ ] `NsfwGateReason` enum introduced; `reason` field typed as
      the enum, rejects unknown values
- [ ] `user_id` / `entity_id` HMAC-hashed at write time
- [ ] `metadata` allowlist applied; known-PII keys redacted; 1 KiB
      cap enforced
- [ ] New `admin.audit.nsfw` capability gate on
      `GET /api/admin/audit` for NSFW event types
- [ ] Structured-log echo replaced with non-PII summary
- [ ] Tests cover: enum rejection, hashing, redaction, capability
      gate
- [ ] `bun run check` + `bun test src/middleware/nsfw-gate/` +
      `bun test src/routes/admin/audit.test.ts` green