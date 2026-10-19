<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Outfit-change hook

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-reactive-actor-appearance
**Caveats:** TOCTOU: the hook writes a chat override that render reads concurrently — the read must tolerate a missing row. Security: the hook reads only the assistant reply; no new input surface. Authorization: the resolved actor must belong to the chat's user before any write. Parallelism: two turns resolving at once can race on the same override row — last write wins, acceptable, and must be pinned by a test. Partial failure: **this is the sharpest caveat** — the story/GM path fails the turn closed on a hook throw, so the hook must swallow every extraction error. Rollback: unregister the hook and flip the flag off; `messages.outfit_id` stays nullable. Stale state: an override outliving the message that wrote it is intended (chat-scoped), not a leak.

**Summary:**

A new `HookHandler` that extracts appearance changes from the **assistant
reply** and routes them through the change gate. Two non-obvious requirements
make this more than a handler.

**Context:**

**Extract from the assistant reply, never the user prompt — this is a decision
the repo already made and reverted.** `src/generation/auto-gen/prepare-generation.ts:13-17`
records it verbatim: the previous user-message scan (`detectAvatarChangeIntent`)
"was removed: it ran on the user's input and biased the LLM toward the user's
mood, which is the opposite of what avatar binding wants (the avatar should
reflect the assistant's reply, not the user's prompt)." Its config surface still
exists (`src/config/sections/templates.ts:128-143`) and its matcher still
exists (`src/assistant/intent.ts:21-33`) with no production caller. Re-attaching
it would re-litigate a settled decision.

**Registration is two-sided, and the second half is invisible when missed.**

1. `initDefaultHooks` (`src/generation/hooks/registry.ts:86-92`) registers it,
   and that function is called at boot from `src/server/start.ts:72`.
2. It must **also** be pushed into the `enabledEventTypes` construction at
   `src/generation/auto-gen/content-hooks.ts:189-193`. The chain is then invoked
   with `eventTypes: enabledEventTypes` (`:207`), and `runHookChain` skips any
   hook whose `eventTypes` set is disjoint from the requested list
   (`src/generation/hooks/registry.ts:54-58`). Miss this and the hook is
   **silently skipped whenever targeting is on**, with no error anywhere.

The event type union is closed today — `mood_shift`, `emotion_change`,
`nsfw_gate`, `moderation_flag`, `privacy_check`
(`src/generation/hooks/types.ts:17-22`) — so a new member is required for the
hook to ever be selected. A fifth config flag is required alongside the
existing four (`src/config/schema/hooks.ts:8-17`, defaults at
`src/config/schema-class/hooks.ts:7-13`, env map at
`src/config/schema-class/env-map.ts:160-163`, JSON schema at
`src/config/schema-class/json-schema/hooks.ts:5-19`).

**Hooks do not short-circuit.** `runHookChain`
(`src/generation/hooks/registry.ts:47-78`) runs every registered hook in order.
This hook must therefore never return a disallowing verdict; it only emits an
event.

**Exception safety is mandatory.** The story/GM path catches a hook-chain throw
and rethrows it — `src/generation/auto-gen/story-store.ts:129-137` logs
"aborting turn (fail-closed)" and throws. An extraction failure must degrade to
"no events".

Two-stage extraction keeps the cheap path free: the regex prefilter
(`src/regex/outfit-events.ts`, new) runs first; the AUX task fires only on a
hit. Actor attribution comes from
`TASK-outfit-change-multi-actor-name-resolution.md`, and gate routing from
`TASK-outfit-change-gate-initiator-mapping.md`.

**Acceptance Criteria:**

- [ ] A new `OutfitChangeHook` implements `HookHandler` and is registered in
      `initDefaultHooks` (`src/generation/hooks/registry.ts:86-92`)
- [ ] A new `HookEventType` member is added to the union
      (`src/generation/hooks/types.ts:17-22`)
- [ ] A fifth `config.hooks.enableOutfitHooks` flag exists with the same
      default-off semantics as its siblings, wired through the schema
      (`src/config/schema/hooks.ts`), defaults
      (`src/config/schema-class/hooks.ts`), env map, and JSON schema
- [ ] The hook's event type is pushed into the `enabledEventTypes` construction
      at `src/generation/auto-gen/content-hooks.ts:189-193` under that flag
- [ ] A test asserts the hook **is skipped** when the flag is off and **does
      run** when the flag is on with `eventTypes` filtering active — this is the
      silent-skip failure mode
- [ ] A test asserts a throwing extraction does not propagate: the chain
      completes and the turn proceeds
      (`src/generation/auto-gen/story-store.ts:129-137`)
- [ ] A test asserts the hook emits no `data.actorId` when attribution fails, so
      `resolveActorIdFromEvents` (`src/generation/auto-gen/content-hooks.ts:244`)
      cannot rewrite the message's actor
- [ ] The hook reads `HookContext.content` (the assistant reply) and never any
      user-message field; a test pins this
- [ ] The hook never returns `suppressContent`
- [ ] Two turns racing on the same chat override resolve last-write-wins, pinned
      by a test
- [ ] Tests pass; `bun run typecheck` and `bun run lint` clean

**Notes / Evidence:**

- Registration + boot: `src/generation/hooks/registry.ts:86-92`; called from
  `src/server/start.ts:72`
- The silent-skip trap: `src/generation/auto-gen/content-hooks.ts:189-193`
  builds the list, `:207` passes it, `src/generation/hooks/registry.ts:54-58`
  filters on it
- No short-circuit: `src/generation/hooks/registry.ts:47-78`
- Fail-closed story path: `src/generation/auto-gen/story-store.ts:129-137`
- Closed event-type union: `src/generation/hooks/types.ts:17-22`
- Config flag surfaces: `src/config/schema/hooks.ts:8-17`,
  `src/config/schema-class/hooks.ts:7-13`,
  `src/config/schema-class/env-map.ts:160-163`,
  `src/config/schema-class/json-schema/hooks.ts:5-19`
- The removed user-input decision: `src/generation/auto-gen/prepare-generation.ts:13-17`
- Dead config surface + dead matcher: `src/config/sections/templates.ts:128-143`,
  `src/assistant/intent.ts:21-33`
- Where a resolved outfit would be returned:
  `src/generation/auto-gen/content-hooks.ts:230-246` (the existing
  `dominantEmotion` extraction is the shape to mirror)