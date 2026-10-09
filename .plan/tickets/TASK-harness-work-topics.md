<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness work topics

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** `.plan/epics/epic-harness-integration.md`
**Tags:** harness, data-model, context
**Summary:** Named work scope (`WorkTopic` / `harness_work_topics` / `workTopicId`) that harness runs attach to, resolved by a deterministic 5-rung auto-scoping ladder.
**Context:** Bare `topic` is taken four ways: lore subject `LoreSubject {kind:"topic"}` (`src/assistant/lore/audience.ts:24`), gossip pub/sub `topic` (`epic-anonymity-decentralization.md:205-216`), chat side-threads (`TASK-chat-feature-topics-side-threads`), NPC topic selection (`epic-social-interaction.md:95`). The harness concept is therefore `WorkTopic`. Scoping is a nullable FK on the harness-side record only — `MemoryScope` stays closed at `character | assistant | world` (`src/memory/types.ts:15`). Reuse-first: the intent taxonomy already exists as `INTENT_PATTERNS` (`src/regex/intent.ts:19`), which `matchWorkflowIntent()` already iterates (`src/assistant/workflow-routing.ts:102`); the epic index already exists at `.plan/epics-index.md`.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] `harness_work_topics` ships in the SAME migration batch as the §11 `harness_runs` / `harness_calls` tables in `epic-harness-integration.md` — not a separate migration file.
- [ ] `WorkTopicId` is a branded string type; the table carries an optional `epicSlug` FK binding into `.plan/epics-index.md`. Standalone topics with no epic binding are valid, so branch-derived topics degrade to free-standing rather than erroring.
- [ ] The 5-rung auto-scoping ladder is implemented and ordered: (1) explicit `--work-topic` flag / route param on dispatch, (2) git branch name → epic slug via `.plan/epics-index.md`, (3) keyword match against `INTENT_PATTERNS` (`src/regex/intent.ts:19`), (4) sticky inherit of the session's current topic, (5) LLM classification.
- [ ] Rung 5 MUST NOT run inline on the dispatch path (epic deadlock rule). It is opt-in, out-of-band, and its result is cached on the run record.
- [ ] A manual pin on a session outranks every automatic rung permanently (rungs 1-5 are skipped while a pin exists); unpinning restores the ladder.
- [ ] A run that resolves no topic falls to the `project` tier and records a classification miss (counter + run-record field) rather than defaulting silently.
- [ ] CRUD exposed under `/api/v1/harness/topics` (harness epic §11 route surface); no second state machine — the entity reuses the existing harness store/repository pattern.
- [ ] Unit tests cover each rung independently, the precedence order between rungs, manual-pin override, and the classification-miss path. `bun run check` green incl. ≥80% line coverage on new modules.

## Related Files

- `src/harness/` (new — entity, store, scoping ladder), `.plan/epics-index.md`
- `src/regex/intent.ts:19` (rung 3 intent taxonomy, reused not re-created), `src/assistant/workflow-routing.ts:102` (existing consumer of it), `src/assistant/lore/audience.ts:24` (collision)
- `src/memory/types.ts:15` (scope boundary — NOT extended)
- `.plan/epics/epic-harness-integration.md` (§11 storage, §8 exec log)
- `TASK-harness-topic-session-attach`, `TASK-harness-context-priority-tiers`, `TASK-harness-topic-tui-surface`

git issue: 4910513
