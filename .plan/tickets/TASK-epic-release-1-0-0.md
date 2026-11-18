<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: EPIC release-1.0.0

**Status:** In Progress
**Priority:** high
**Effort:** Medium

**Summary:**

Release 1.0.0 roadmap tracker. Thesis: an operator can install loop-lore, gate who runs what, import characters without silent loss, and run chat from a phone browser — with a finalize cadence fast enough to ship fixes the same day.

Theme tickets (this release scope):

1. TASK-1-0-0-theme-1-operator-correct-agentic-runtime-harness-ladde.md (issue 174eca7)
2. TASK-1-0-0-theme-2-card-portability-without-silent-loss-import-ex.md (issue 442dc3b)
3. TASK-1-0-0-theme-3-chat-as-the-product-scripting-lite-product-res.md (issue 97b0aae)
4. TASK-1-0-0-theme-4-mobile-ready-web-without-a-native-package.md (issue c137c78)
5. TASK-1-0-0-theme-5-frontend-completion-against-shipped-backends-c.md (issue bd1d1e4)
6. TASK-1-0-0-theme-6-release-cadence-fast-trustworthy-finalize.md (issue 0d91828)

GAP tickets (2026-11-11):

1. TASK-1-0-0-gap-unified-cross-surface-omni-search.md (issue 9d90969) — Done
2. TASK-1-0-0-gap-sd-cpp-local-image-wiring-as-owned-scope.md (issue 4bd966e) — Done for the owned discovery/setup/failover slice; listed remainders are separate tickets
3. TASK-1-0-0-gap-verify-multi-assistant-and-multi-llm-chat-rows.md (issue 2f405b6) — In Progress: variants selectable; harness setting + picker filter open
4. TASK-1-0-0-gap-backup-restore-before-1-0-0-required-unstarted.md (issue 942d357) — Done; download/upload, scheduling and admin UI deferred
5. TASK-1-0-0-gap-vn-custom-typeable-choices.md — Done; closes the VN Required line's custom-typeable leg (typed question answers + typed branching actions, provenance-flagged; branch vn-free-text-choices)
6. TASK-1-0-0-gap-omni-search-frontend-consumer.md (issue 91d9e08) — Done; Alpine search callers and the browser flow use the unified endpoint.
MFA (deferred-then-approved 2026-11-11): TASK-1-0-0-mfa-email-messenger-code-channel-first-metaapplication.md — Done for email/messenger code delivery; TOTP later. Dedicated operator docs still absent.
Flavors hermes/openclaw (IN decision 2026-11-11): implemented in tree/harness-flavor-parity @ fa95b7ca, landing pending; no flavor tickets needed.

Baseline (refreshed 2026-11-18): `package.json` and `CHANGELOG.md` are at 1.0.0; zero git tags (tagging stays an operator decision). Epic/ticket status counts are recomputed with `bun run plan:status` rather than pinned here.

Sequencing: theme 1 ladder rung (a) blocks all theme-1 3.3 features; theme-5 UI lands behind the finalize wave (p0-battle-ui, world-mgmt-gaps, edge-case-tests-20261101, synthetic-qa-capture); theme-2 tag routing ships in the normalizer lane; theme-4 PWA shell precedes budget work; theme-6 research-only.

Open questions for the operator:

1. Version/tag policy: package.json + CHANGELOG are at 1.0.0; creating the git tag remains the operator's call.
2. Which of the 211 Not-Started epics are explicitly OUT of 1.0.0?
3. Status-vocab enforcement: hard gate now or advisory until R1 cleanup?
4. 2MB tickets/index.json split: before or after 1.0.0 scope?
5. Confirm thin-client-over-API as the 1.0.0 mobile answer?

Related: .tmp/research/release-1.0.0-roadmap.md

## Operator-approved scope (2026-11-11)

Required (32, grouped) — verbatim at .tmp/intercom/RELEASE-1.0.0.md:
- Chat scenarios + assistant: user x user/users/llm/llms mixes; 1 + multi-assistant chat.
- Messages + branching: reaction, management, branching, branch-merge mechanics.
- VN mode: VN mode + story generation with limited/custom-typeable choices.
- Users + setup: multi-user + permission gating + solo 1-user; out-of-box config + empty-state recovery.
- Memory + context + privacy: chat/harness memory + linkage/drop/search; rotation/invisible compaction; msg compression/encryption-at-rest + access gating.
- World + lore: location/locationless + transient travel + fractal locations; lore/memories/event propagation.
- Characters + impersonation: full character system (create/edit/emotion/state/stats/specs/loadouts/ref/voice/greeting); world-level memories; user->char + assistant->char impersonation.
- Platform tail: gallery (frontend/caption/metadata/assistant-loop/download/encrypt); search utilities; llama-swap local LLM + sd.cpp/comfyui; RSI + ACP/SDK harness + consent; grading/autoroute; orchestration; web+TUI; settings; backup/recovery; logging; image/audio gen.

Desirable (11): fast finalize/gates; db slicing/sharding; gaming mechanics; engine export/RenPy; 2d/3d content; 2d/3d canvas; wasm egui; rpg rules; compacted migrations; nsfw; multi-instance federation.

GAPs: unified omni-search (no epic); sd.cpp wiring (partial); multi-assistant/multi-LLM rows unverified; instance-level memory (deferred).
Missed-5: MFA decision; i18n gate; e2e/QA subset; API versioning pin; backup/restore mismatch.
Related: .tmp/intercom/RELEASE-1.0.0.md (operator lists verbatim).

### Epic linkage (header `**Status:**` verified 2026-11-11; drift noted inline)

- Chat scenarios + assistant: epic-chat-variants-taxonomy.md (Done) + epic-group-chat.md (In Progress). GAP: multi-assistant/multi-LLM rows unverified → TASK-1-0-0-gap-verify-multi-assistant-and-multi-llm-chat-rows.md (2f405b6).
- Messages + branching: epic-conversation-branching.md (header Not Started — DRIFT: all 3 body ACs checked with shipped code `src/chat/service/branch-merge.ts` + migration 047; effective Shipped) + epic-frontend-emoji-reactions.md (In Progress).
- VN mode: epic-visual-novel-mode.md (In Progress; 5 VN tickets re-synced Done → In Progress per 2026-10-18 adjudication).
- Users + setup: epic-auth-access.md (In Progress) + epic-guest-access.md (In Progress) + epic-first-run-auto-setup.md (Not Started) + epic-configs-path-resolution.md (Not Started).
- Memory + context + privacy: epic-memory-knowledge-systems.md (In Progress) + epic-memory-propagation.md (In Progress, first slice) + epic-chat-context-optimization.md (Not Started) + epic-chat-privacy.md (Not Started) + epic-crypto.md (In Progress) + epic-encryption-workflow.md (In Progress).
- World + lore: epic-world-locations.md (Not Started) + epic-fractal-locations.md (Not Started) + epic-lore-knowledge.md (In Progress).
- Characters + impersonation: epic-character-core-system.md (In Progress) + epic-impersonation.md (In Progress).
- Platform tail: gallery epic-frontend-gallery.md (Done) + epic-asset-transform-metadata.md (In Progress); search has NO EPIC — closest epic-rag-retrieval.md + epic-rag-ui.md (both Not Started) → GAP (9d90969); llama-swap epic-llama-swap.md (Not Started); sd.cpp inside epic-local-process-swarm.md (Not Started, partial) vs comfyui epic-comfyui-plugin.md (In Progress) → GAP (4bd966e); harness RSI epic-recursive-self-improvement.md (Not Started) + ACP epic-external-harness-acp.md (In Progress) + epic-agentic-integration-mcp-acp.md (Not Started); grading epic-model-rankings-history.md (Not Started); web+TUI epic-terminal-ui.md (In Progress); settings epic-frontend-settings.md (Done); backup epic-database-backup-recovery.md (Not Started) + epic-db-asset-snapshot-recovery.md (Not Started) → GAP (942d357); logging epic-logging.md (In Progress); image/audio epic-image-video-scenario-studio.md (Not Started) + epic-audio-video-sound.md (Not Started) + epic-assistant-entity-access.md (In Progress).

### Verification reconciliation (2026-11-18 closeout)

- Done with landed code: F7 migration serialization (`7dec974bb`), bind-first port conflict (`ddc22e015`, `b9adbc2a1`), Postgres honesty warning (`ab543ecb9`), the three harness-queue BUGs (H1/H16/H17), omni-search route + frontend, sd.cpp/ComfyUI owned setup slice, backup/restore + operator docs (`60e34f035`), MFA code channel + factor enrollment, age-gate audit, VN custom-typeable choices.
- Contradictory “no fix present / stays Not Started” notes removed from the three harness-queue BUG tickets; their original verification notes now match the Done status.
- `TASK-1-0-0-gap-verify-multi-assistant-and-multi-llm-chat-rows.md` stays In Progress with corrected scope: variants are selectable, the validation-harness setting and picker filter are the open legs.
- New tickets filed from the audit: `FEAT-relay-swarm-node-mode` (Desirable/post-1.0.0), `TASK-wire-scenario-into-model-role-autoroute` (Required autoroute leg), `TASK-expose-validation-harness-name` (variants follow-up).
- Index hashes for the three new tickets are deferred by `giwt sync --fix` in this linked worktree and regenerate post-merge on the target branch; no hand-edits to `.plan/tickets/index.json`.
- MFA's “Documentation updated” AC is intentionally left unchecked — no dedicated operator docs section exists yet.
- Rerank routing is NOT already covered by `reranking > aux > general`: there is no `reranking` task signal, rerank never calls `resolveModelRole`, and `general` is an autoroute scenario, not a fallback role. Filed `FEAT-dedicated-rerank-model-role-and-task-signal-with-aux-general.md` (d195a7c).
- New 2026-11-18 audit tickets (git issues created, ticket index synced): `BUG-moderator-hidden-message-readable-by-direct-id-in-public-cha.md` (5113af5), `BUG-memory-semantic-floor-evaluated-against-reranker-scores.md` (e7fa219), `BUG-admin-db-restore-validates-only-sqlite-header.md` (29d1529), `TASK-remove-injected-defaults-from-key-mechanic-enums.md` (2b99d96), `TASK-desired-context-window-and-promote-pruned-messages-to-memory.md` (3e9a8e5), `TASK-composer-up-down-recall-of-prior-typed-text.md` (dd0970d), `TASK-render-stored-chat-background-on-standard-chat-surface.md` (9c69f09), `TASK-close-remaining-release-gate-debt.md` (65a5e31), `TASK-reconcile-1-0-0-tracker-and-ticket-statuses-with-shipped-cod.md` (a9012f2), `TASK-instance-path-hygiene-close-f18-h4-h5.md` (c5b2746), `TASK-admit-external-agent-to-worktree-confined-repo-check.md` (fde2df0), `TASK-test-unified-search-admin-scope-and-partial-failure.md` (13c2ea3), `TASK-relevance-aware-memory-decay-and-tunable-injection-policy.md` (c233bc9).
- Missed-items follow-up: `BUG-delete-all-data-calls-nonexistent-delete-users-me-route.md` (8d44816) closes the shipped high-priority settings action that calls a nonexistent DELETE route; `TASK-re-enable-stale-skipped-browser-e2es-for-shipped-fixes.md` (02b410d) closes the live e2e/QA residue of Missed-5. The two genuinely blocked skips (SMK secret, chatState init) stay under their existing Not-Started tickets.
- DX proposal (post-1.0.0, consider/decline): generate `reference/api.md` from the already-served `/api/v1/openapi/json` spec in `docs:build`; production routes need `detail`/`description` annotations first or the generated pages are hollow.
- Operator approvals 2026-11-18: honkbox support desired in this release; img2img init-image plumbing approved; route annotations plus OpenAPI reference regeneration approved; gallery enhancement backlog labelled post-1.0.0; i18n epic statuses reconciled; blocked browser skips tracked.
- New approval-backed tickets: `FEAT-honkbox-capability-descriptor-registry-and-feature-gate-help.md` (55f8fd5), `TASK-check-validate-and-verify-composer-commands-with-undefined-s.md` (b160346), `TASK-full-chatprivacy-model-profile-behind-a-documented-default.md` (d88966b), `TASK-backup-download-upload-scheduling-and-admin-panel-follow-up.md` (cd35549), `TASK-mfa-dedicated-operator-documentation.md` (26384e0), `TASK-natural-language-picture-of-the-character-dispatches-to-avat.md` (6e2d4a2), `TASK-persist-generated-image-as-chat-background.md` (2b21d43).
- Existing tickets refreshed rather than duplicated: honkbox capability premise (stale BLOCKED removed, URL/DTO corrected), `TASK-img2img-init-image-plumbing.md` moved Blocked -> Not Started on operator approval, OpenAPI reference ticket fields captured, `FEAT-2026-009` scoped, `epic-frontend-internationalization.md` marked Done, gallery backlog labelled post-1.0.0. The two blocked browser skips stay on `TASK-provide-smk-secret-in-browser-test-server-config-so-key-gene.md` and `TASK-browser-chatflow-upload-deferred.md`.
- Closed with landed code and verification notes on 2026-11-18: `BUG-moderator-hidden-message-readable-by-direct-id-in-public-cha.md` (`23e89fdca`), `BUG-memory-semantic-floor-evaluated-against-reranker-scores.md` (`73209dc56`), `BUG-admin-db-restore-validates-only-sqlite-header.md` (`23e89fdca`), `BUG-delete-all-data-calls-nonexistent-delete-users-me-route.md` (`d22bfa7bd`). Git issues auto-closed on the Done markers; index synced in `b2f155c93`. Delete-all scope deliberately excludes worlds/personas/assets/API keys/notifications per the ticket; dedicated MFA docs stay as the new follow-up ticket.

**Caveats:** TOCTOU: n/a, planning tracker. Security: n/a. Authorization: operator decides open questions. Parallelism: theme tickets proceed in sequence per roadmap §6. Partial failure: themes land independently. Rollback: n/a. Observability: this ticket tracks the six theme issues.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
