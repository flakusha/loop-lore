# BUG: content-hooks.ts missing imports breaks typecheck

**Status:** ✅ Resolved (already on dev, 2026-09-03)
**Priority:** high
**Effort:** Medium

## Summary

src/generation/auto-gen/content-hooks.ts uses jsonParseOr at line 154 and HookEventType at line 179 but neither is imported (import block is lines 16-24). Build is red on dev. Fix: re-add `import { jsonParseOr } from "../../utils"` and `import type { HookEventType } from "../hooks"`.

## Resolution

Already fixed in dev by an earlier session. Verified 2026-09-03 against current `dev` (`60a76152`):

- `src/generation/auto-gen/content-hooks.ts:23` — `import { jsonParseOr, } from "../../utils";` present.
- `src/generation/auto-gen/content-hooks.ts:25` — `import { type HookEventType, } from "../hooks/types";` present.
- `jsonParseOr` used at `content-hooks.ts:165` (NSFW policy parse).
- `HookEventType` used at `content-hooks.ts:190` (`enabledEventTypes: HookEventType[]`).
- `bunx tsc --noEmit -p tsconfig.backend.json` does not flag `content-hooks.ts`.

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
