<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Aux-pipeline task markers and eval labels do not match the live paths

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

Twelve verified defects in src/aux-pipeline, all of the same shape: a marker, a prompt contract or an eval label disagrees with what the code actually does, so a real regression passes the eval or a real path is dead.

Markers

- task-detect.ts:24 lists 'memory' in TASK_MARKERS but :35 scans only messages with role 'system'; the memory path (src/memory/extraction.ts:46-47) sends the memory prompt as a user message, so the marker can never match. No test scripts a memory reply.
- task-detect.ts:16-25 has no 'carriage' entry even though carriage-authoring.ts:77-79 sends CARRIAGE_AUTHORING_PROMPT as a system message, so detectAuxTask returns null on every carriage call.

Prompt contracts

- prompts.ts:96-98 claims 'currently no in-tree consumer calls the LLM for NSFW classification'. That is false: src/middleware/nsfw-gate/nsfw-hook.ts:148-149 calls detectNsfwWithLlm when useLlmClassifier is set, which routes through src/middleware/nsfw-gate/nsfw-classifier.ts:71 to callAux('nsfw') and NSFW_POLICY_PROMPT. The comment understates a live safety path.
- prompts.ts:189-215 asks the model to author next_episode, artifacts, locations_discovered, elders_awakened, primal_aura_intensity and companions. carriage.ts:58-82 carriageEntries and :89-99 carriageRenderLines read only episode, title, setting and characters, and structured-output.ts:156-167 validates only those four. Every other key is silently discarded.
- registry.ts:64 and :68 — the chat default is 'You are {{charName}}. {{charDescription}}' and the imagePrompt default is 'Write image generation tags for: {{scene}}'; resolveSystemPrompt at :108-117 returns both verbatim and no interpolation exists, so prompt-template.ts:80-92 hands the raw {{charName}} string to the UI. (imagePrompt has no runtime consumer, so only the chat default is user-visible.)
- prompts.ts:104 lists null in the categories union, inviting a [null] verdict; MODERATION_PROMPT at :124 correctly uses [] for the clean case.
- task-clarification.ts:84-86 injects input.action verbatim into a system message; wrapSection (xml-utils.ts:90-93) only escapes <, > and & and does not mark the text as untrusted.

Eval fidelity — both evals pass on degradation

- transition-classifier.ts:183-190 returns { isTransition: false, type: null, confidence: 0, source: 'none' } when the aux call fails; eval/runner.ts:28-32 renders that as 'false:null', identical to a genuine negative, and the transition-combat-none fixture (corpus.ts:117-123) expects exactly that. parseNullRate stays 0.
- nsfw-classifier.ts:78 returns 'none' when the LLM call fails; the nsfw-safe-campfire fixture (corpus.ts:72-77) expects 'none'. An aux outage scores as correct classification.

Minor

- eval/env.ts:85-86 casts ModelRole.Auxiliary to never twice; ModelRole is imported from enums-core in both modules, so the cast is pure noise that would mask a future signature mismatch.
- aux-pipeline/index.ts:10-19 exports eight prompts but not CARRIAGE_AUTHORING_PROMPT, so carriage-authoring.ts:14 deep-imports it while every other default goes through the barrel.
- aux-pipeline.test.ts:57-60 is named 'AuxTaskName covers all five known tasks' but asserts the length of a hand-built 5-element array; AuxTaskName has 13+ variants.

Source: .tmp/longcat/review-prompts-aux.md items 1-12.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
