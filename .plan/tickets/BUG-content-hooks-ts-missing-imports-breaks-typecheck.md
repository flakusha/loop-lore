# BUG: content-hooks.ts missing imports breaks typecheck

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/generation/auto-gen/content-hooks.ts uses jsonParseOr at line 154 and HookEventType at line 179 but neither is imported (import block is lines 16-24). Build is red on dev. Fix: re-add `import { jsonParseOr } from "../../utils"` and `import type { HookEventType } from "../hooks"`.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
