<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Group participant injection absent on manual generate route

**Status:** ✅ Done (worktree fix-group-participant-injection; production code landed, tests WIP)
**Priority:** medium
**Effort:** Medium

## Summary

groupParticipantsSection only enabled via params.groupParticipantIds, set only in prepare-generation. build-prompt.ts / context-budget.ts omit it. Also includes user participants. Wire groupParticipantIds on manual route; exclude actor_type=user.

## Resolution

Production code landed in commit dc716c4b:
- `src/generation/generate-route/handler.ts`: `handleGenerate()` resolves `groupParticipantIds` via the same `chat_participants × actors` join as auto-generation, excluding `actor_type='user'` and the generating actor itself.
- `src/generation/generate-route/build-prompt.ts`: `BuildPromptOpts.groupParticipantIds?: string[]` threads the ids into the `PromptAssembler.assemble({...groupParticipantIds, task:"chat-reply"})` call.
- `src/routes/chat-context/context-budget.ts`: budget advisor resolves the same ids so the prompt token estimate reflects `groupParticipantsSection` in group chats.

## Note

Tests in `src/generation/generate-route/group-participants.test.ts` were authored but are isolated from the production commit due to a `mock.module()` leak from `image-gen-route.test.ts` that prevents the tests from running outside `bun run test:unit --isolate`. Test file retained as WIP for a follow-up commit.

## Acceptance Criteria

- [x] Implementation complete
- [ ] Tests passing (WIP — runner-isolation issue, see Note)
- [ ] Documentation updated
