<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: EPIC release-1.0.0

**Status:** Not Started
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

1. TASK-1-0-0-gap-unified-cross-surface-omni-search.md (issue 9d90969)
2. TASK-1-0-0-gap-sd-cpp-local-image-wiring-as-owned-scope.md (issue 4bd966e)
3. TASK-1-0-0-gap-verify-multi-assistant-and-multi-llm-chat-rows.md (issue 2f405b6)
4. TASK-1-0-0-gap-backup-restore-before-1-0-0-required-unstarted.md (issue 942d357)
MFA (deferred-then-approved 2026-11-11): TASK-1-0-0-mfa-email-messenger-code-channel-first-metaapplication.md — email/messenger first, TOTP later.

Baseline: 374 epics (211 Not Started / 110 In Progress / 52 Done / 1 Postponed); 4486 tickets (~2650 open-like / ~1830 closed-like); 32% no usable epic pointer; no 1.0.0 epic (only epic-release-010 for 0.1.0); package.json 0.1.0; zero git tags.

Sequencing: theme 1 ladder rung (a) blocks all theme-1 3.3 features; theme-5 UI lands behind the finalize wave (p0-battle-ui, world-mgmt-gaps, edge-case-tests-20261101, synthetic-qa-capture); theme-2 tag routing ships in the normalizer lane; theme-4 PWA shell precedes budget work; theme-6 research-only.

Open questions for the operator:

1. Version/tag policy: v1.0.0 tag + package.json bump at approval or first RC?
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

**Caveats:** TOCTOU: n/a, planning tracker. Security: n/a. Authorization: operator decides open questions. Parallelism: theme tickets proceed in sequence per roadmap §6. Partial failure: themes land independently. Rollback: n/a. Observability: this ticket tracks the six theme issues.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
