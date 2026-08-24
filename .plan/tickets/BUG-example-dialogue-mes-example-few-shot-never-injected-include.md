<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Example dialogue (mes_example few-shot) never injected; includeExamples never set

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

examplesSection.enabled needs ctx.params.includeExamples (default false); no caller in src passes it. Character mes_example never injected as few-shot. Enable by default or pass includeExamples from generate routes.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
