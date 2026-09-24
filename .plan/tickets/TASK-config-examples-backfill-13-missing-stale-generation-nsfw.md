<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Config examples backfill: 13 missing + stale generation/nsfw

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** medium
**Effort:** Medium
**Epic:** epic-config-extensions.md

## Summary

configs/ lacks examples for assistant, ageGate, cron, dynamicResponse, federation, frontend, hooks, idempotency, observability, seeding, characters, testing, templates. config.generation.example.toml is 4 lines vs full schema (defaultStream/modelRoles/regexTransforms/emotionAvatar/localModels/chatDefaults/providers bedrock-anthropic-ollamaNative/sd defaults/autoStart). NSFW example missing defaultNsfwScope/consentRequired/auditLogging/useLlmClassifier. Also resolve messages.idempotencyExpiryHours vs idempotency.ttlMs duplication (pick one owner). Acceptance: new example files validate against schemas; generation + nsfw examples regenerated; idempotency TTL single-sourced.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
