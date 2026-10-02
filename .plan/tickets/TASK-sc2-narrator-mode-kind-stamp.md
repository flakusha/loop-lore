<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Narrator-mode kind stamping — `narration` vs `actor_action`

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Summary:** Narrator-mode (`Perspective = narrator`) user messages and GM/narration output are stamped `kind: narration`. First/third-person actor messages are stamped `kind: actor_action`. This replaces author-inference with deterministic source-based stamping, enabling kind-first-class dispatch in context assembly, rendering, and extraction. The schema addition (`MessageKind`) is the cheapest change with the widest unblocking effect — it ships before perspective, gate, skip, and two-pass all depend on it.

**Context:** `matrix-story-coherence.md` SC2. Design agreed: `epic-narration-actor-separation.md` owns the `MessageKind` contract (`narration | actor_action | system`). `epic-perspective-narration-voice.md` defines `Perspective`. The stamping logic lives in the message-write path where `Perspective` is known. `epic-two-pass-delivery.md` SC6 and `epic-actor-turn-skip.md` SC8 both depend on this.

**Acceptance Criteria:**

- [ ] `MessageKind` enum added: `narration | actor_action | system` (in `src/db/enums-core/messages.ts` alongside existing `MessageContentType`; or a dedicated `MessageKind` type if separation warrants it).
- [ ] Narrator-mode message write path stamps `kind: 'narration'` — user messages sent when `Perspective = narrator`.
- [ ] First/third-person actor message write path stamps `kind: 'actor_action'` — user messages and assistant actor turns.
- [ ] GM/narration output (scene-level exposition, no character ownership) stamped `kind: 'narration'`.
- [ ] System messages (OOC, gate notices, skip records) continue to use `kind: 'system'` — no change.
- [ ] All existing call sites that infer kind from author are migrated to read `kind` directly.
- [ ] Unit tests: narrator stamp, actor stamp, GM narration stamp, system unchanged.
- [ ] `bun run check` green.

**Epic:** epic-narration-actor-separation
**Design note:** `src/db/enums-core/messages.ts:22` already defines `MessageContentType.Narration = 'narration'`. `MessageKind` is a *distinct* concept — `MessageContentType` classifies content *encoding* (text, action, narration, system…), while `MessageKind` classifies *authorship role* (narration = GM/scene narration, actor_action = character, system = OOC infrastructure). The overlap in the "narration" value is intentional: a `MessageContentType.Narration` message written by an actor has kind `actor_action`; a `MessageContentType.Narration` message written by GM has kind `narration`. These are orthogonal axes, not redundant enums — extend `MessageContentType` with a `kind` field on the message schema rather than parallel enum.
**Tags:** message-kind, narrator, actor_action, stamping, schema, integration
**Related:** epic-perspective-narration-voice.md, epic-actor-turn-skip.md, epic-two-pass-delivery.md, matrix-story-coherence.md:28, TASK-sc1-perspective-gate-bypass, TASK-sc7-gate-separation-kind-semantics, epic-actor-turn-skip.md (SC8 IMPLEMENTED — `src/chat/service/crud/turn-skip.ts:7`)

git issue: 5892992
