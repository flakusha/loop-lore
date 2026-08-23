<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Extend talkativity to also influence response verbosity (design proposal — separate from selection-rate)

**Status:** 📝 Draft
**Priority:** medium
**Effort:** small
**Type:** TASK
**Epic:** epic-chat-context-optimization
**Depends on:** BUG-group-chat-talkativity-not-surfaced-in-prompt (the prompt must surface the score first)

## Context

Per the spec (`docs/frontend/chat/group-chat.md`) and migration `003_group_chat.ts`, `chat_participants.talkativity` is a **1–10 per-chat participation weight** that **biases how often the actor is selected to speak** (initiative strategy: `talkativity * 2 + initiative_points`).

The current design treats talkativity as **selection-frequency only**. After `BUG-group-chat-talkativity-not-surfaced-in-prompt` lands, the LLM will see the score in its prompt — but the spec doesn't formally decide whether the score should also influence **response verbosity / length**.

This is a **design decision**, not a bug. The spec leaves room for either:
- **Selection-only** (current): talkativity biases who speaks, not how much they say when selected.
- **Selection + verbosity**: high-talkativity actors produce longer / more detailed replies; low-talkativity actors produce shorter replies.

## Open questions

1. **Single dimension or split?** Should we split talkativity into two fields (`talkativity` for selection, `verbosity` for length), or use one field for both? One field is simpler; two fields lets users tune selection and verbosity independently.
2. **Length mapping.** If single field, what is the mapping? Linear (`max_tokens = base * (talkativity / 5)`)? Thresholded (1–3 = short, 4–7 = medium, 8–10 = long)? Or prompt-side only ("you tend to be brief" / "you tend to elaborate")?
3. **Strategy consistency.** Should all strategies (round_robin, scene_based, initiative, quest_driven, hybrid) respect verbosity, or only initiative?
4. **UI affordance.** Does the existing talkativity slider (1–10) need relabeling, or do we add a separate verbosity slider?

## Proposed direction

Recommend **single field with prompt-side guidance**:
- Keep the existing `chat_participants.talkativity` 1–10 column.
- After surfacing the score in the prompt (the prerequisite BUG), also add a guidance suffix based on score: "You tend to be brief" (1–3) / "You speak in moderate detail" (4–7) / "You tend to elaborate at length" (8–10).
- Do NOT change `max_tokens` — let the model decide length naturally.
- Add a config flag `config.templates.groupChat.talkativityVerbosity: 'off' | 'prompt' | 'token-cap'` so admins can opt in or out.

## Acceptance criteria

- [ ] Decision documented: single field vs split fields.
- [ ] Mapping chosen (linear / thresholded / prompt-only).
- [ ] Config flag for opt-in / opt-out.
- [ ] Tests: low-talkativity actor produces shorter replies on average (statistical); high-talkativity produces longer.
- [ ] No regression in selection-frequency behavior.

## Files

- `src/db/migrations/???_talkativity_split.ts` (if split chosen)
- `src/assistant/prompt/sections/group-participants.ts` (extend with guidance)
- `src/config/sections/templates.ts` (add verbosity flag)
- `src/group-chat/turn-selector.ts` (pass verbosity hint to prompt assembler)

## Related

- `BUG-group-chat-talkativity-not-surfaced-in-prompt.md` (prerequisite — surfaces the score).
- `epic-world-chat-channels-invites.md` G2 (talks about "talkativity does not yet influence how much the selected actor says").
- `epic-chat-context-optimization.md` (per-actor prompt shaping).
