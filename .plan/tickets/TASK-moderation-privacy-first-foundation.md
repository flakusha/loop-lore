<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Moderation: Privacy-First Foundation

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** 🟡 Partial — moderation data model + NSFW gate exist; ModerationHook keyword-only, dead `Moderation` model role, destructive suppression (2026-08-01)
**Priority:** high
**Effort:** Small
**Epic:** epic-chat-lifecycle-moderation

## Summary

Privacy-first moderation: local-only, no server logging, no AI content scanning by default. Configurable tiers: none / local-only / admin-opt-in-audit. Future tickets can add complexity. Blocks Epic 36 (Chat Lifecycle).

## Current State (2026-08-01 review)

| Component                       | Status                                               | Location                              |
| ------------------------------- | ---------------------------------------------------- | ------------------------------------- |
| Prefs / actions / flags / audit | ✅ `NsfwModerationService`                           | `src/nsfw/moderation-service.ts`      |
| NSFW gate + audit writes        | ✅ keyword-level, per-chat/world/user overrides      | `generation/hooks/nsfw-hook.ts`       |
| Moderation content scanning     | ⚠️ keyword-only (9 words), no LLM, **no audit trail** | `generation/hooks/moderation-hook.ts` |
| `ModelRole.Moderation`          | 🔴 dead role — configurable, never resolved          | `src/admin/model-roles.ts`            |
| Flagged content handling        | 🔴 entire response discarded on `suppressContent`    | `generation/auto-gen.ts:431`          |

Privacy posture preserved: no external scanning by default — all current
detection is local keyword matching. The dead `Moderation` role is the only
surface that could leak content to an external model; wire it only under
`admin-opt-in-audit` tier.

## Next Actionable Items

1. **Decide moderation tier semantics** — `none / local-only / admin-opt-in-audit`:
   `local-only` = current keyword hooks; `admin-opt-in-audit` = allow
   LLM moderation via `ModelRole.Moderation` (never default-on).
2. **Non-destructive suppression** (epic item 2): store flagged message with
   status, don't drop; add `recordAction` audit on flag (parity with nsfw-hook).
3. **Word-boundary matching + severity scoring** (epic item 3).
4. **Wire `ModelRole.Moderation`** under opt-in tier or remove from
   `VALID_ROLES`/admin UI (epic M3).
5. **Tests**: moderation hook unit tests exist (`chat/moderation.test.ts` is
   action-model tests); add hook-level tests for flag/severity/audit paths.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated


## Verification 2026-09-26

Verdict: **still-open-expanded** — 4 of 5 dated claims flipped since 2026-08-01; one design decision remains.

Src checked:
- `src/generation/hooks/moderation-hook.ts:112-172` — keyword scan (tokenized word-boundary, severity scoring) + opt-in LLM escalation via `detectModerationWithLlm` gated on `context.config.hooks.enableModerationLlmClassifier === true` (default on via `HOOKS_DEFAULTS`, `src/config/schema-class/hooks.ts:12`). Only `severe` suppresses; `moderate` flags without suppression; every flag writes an audit row via `recordAudit` (`content_blocked` vs `content_flagged`). Covered by `moderation-classifier.test.ts` + `hooks.test.ts`.
- `src/chat/moderation.ts:507-511` — `applyFlag` reuses the same `ModerationHook.execute`, so hook/audit semantics stay consistent.
- `src/db/enums-core/flags.ts:81` — `ModelRole.Moderation = "moderation"` exists as an enum value, but `src/admin/model-roles.ts:25-30` `VALID_ROLES` is still `[Main, Auxiliary, Captioning, Classifier]` — `resolveModelRole(Moderation)` throws (pinned by `model-roles.test.ts:143,201`). So "dead role" is accurate for the admin path, but the hook's LLM path does NOT use that role — it goes through the shared `callAux` auxiliary role, which preserves the privacy posture (no separate moderation-model leak surface).
- Suppression is non-destructive at the hook layer (severity/score/matched preserved in event data + audit log); full message-row retention status is owned by the chat-lifecycle epic, not this hook.

Refreshed deltas:
- Mark done: word-boundary matching + severity scoring, non-destructive flag data, audit-on-flag parity, hook-level tests.
- Still open: tier semantics decision (`none / local-only / admin-opt-in-audit`) — today the LLM classifier defaults ON via `HOOKS_DEFAULTS`, which contradicts the ticket's "never default-on" posture. Either flip the default to opt-in or update the ticket design to "default-on, local-model friendly". Recommend a needs-split: (a) tier-semantics default flip, (b) message-row retention in the lifecycle epic.
