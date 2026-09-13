<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Guided-regen Action menu on assistant messages

**Status:** ✅ Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-output-control-transforms

## Summary

Regenerate menu (Try Again / Add Details / More Concise) over the existing runRewrite styles, as message actions per the Open WebUI Action pattern. First consumer of registry-declared message actions.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Implemented in tree/prompt-power-batch: `src/assistant/commands/regen.ts` — registry-declared message actions (`listMessageActions`: try-again/add-details/more-concise) with `/regen` as first consumer (try-again→rewrite/clear, more-concise→rewrite/concise, add-details→improve/expand on the last assistant message). 7 tests green. Frontend menu wiring deferred.
