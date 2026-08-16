<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Moderation: Privacy-First Foundation

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
