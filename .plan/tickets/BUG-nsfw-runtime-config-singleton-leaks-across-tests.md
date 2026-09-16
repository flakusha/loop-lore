# BUG: nsfwRuntimeConfig singleton leaks across test files

**Status:** ✅ Done — fixed on dev by 7190e37df + 3b95687df (2026-09-14), verified live + 36 consumer tests green
**Priority:** medium
**Effort:** Tiny

## Summary

`src/nsfw/runtime-config.ts` exports `nsfwRuntimeConfig` as a module-level singleton. `admin-nsfw.test.ts` exercises PUT `/api/admin/nsfw` which calls `updateRuntimeNsfwConfig({allowNsfw: false, ...})`, mutating the singleton. The singleton state persists across test files because Bun's default test runner shares the module registry without `--isolate`. Subsequent tests that read `getRuntimeNsfwConfig().allowNsfw` (e.g. `src/story/game-master.test.ts:373` and `src/assistant/prompt/sections/nsfw-policy.test.ts:68`) see the contaminated value.

## Repro (full suite, alphabetical order)

```
$ bun test src/
... admin-nsfw.test.ts PUT /api/admin/nsfw (sets allowNsfw=false)
... game-master.test.ts LLM mode: injects NSFW policy section when appConfig allows NSFW (FAIL)
```

Test asserts `systemMessages.some(m => m.content.includes(NSFW_POLICY_LEVELS_PROMPT))` — true when NSFW allowed, false (SFW variant injected) when `nsfwRuntimeConfig.allowNsfw === false`.

## Verification

- `bun test src/story/game-master.test.ts src/routes/admin-nsfw.test.ts` → 2 pass (correctly ordered)
- `bun test src/ --isolate` → 0 fail (clean isolation)
- `bun test src/` (no flag) → 32 fail on feat-stabilize-high-value branch (was 57 on dev baseline; dev's alphabetical ordering happened to dodge this specific test)
- `bun test src/ --randomize --seed=42` (on dev) → 162 fail — same pollution exposed, confirming pre-existing nature

## Resolution (recommended)

Option A — local fix in `admin-nsfw.test.ts`:

```ts
import { initNsfwRuntimeConfig, } from "../nsfw/runtime-config";

afterEach(() => {
  initNsfwRuntimeConfig({
    allowNsfw: true,
    nsfwMinAge: 18,
    defaultNsfwScope: "chat",
    consentRequired: true,
    auditLogging: true,
    useLlmClassifier: false,
  });
});
```

Option B — global: add `--isolate` to default test script in `package.json` so all `bun test` runs are isolated. Side-effect: slower.
## Resolution

Fixed on dev. `7190e37df` added `resetNsfwRuntimeConfig()` + preload hook; follow-up `3b95687df` replaced the preload (which ran once per process) with per-file `beforeEach(resetNsfwRuntimeConfig())` in all three NSFW consumers (`admin-nsfw.test.ts:81`, `nsfw-policy.test.ts:44`, `game-master.test.ts:36`) after the preload proved insufficient for shared-process runs. Verified 2026-09-16 in this session: 10 (admin-nsfw) + 4 (nsfw-policy) + 22 (game-master) = 36 pass, 0 fail. No code change in this ticket.

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
## Files involved

- `src/nsfw/runtime-config.ts` — singleton source (no `reset()` exposed)
- `src/routes/admin-nsfw.ts:20` — calls `updateRuntimeNsfwConfig`
- `src/routes/admin-nsfw.test.ts:82,94,106` — writes `{allowNsfw: false}`
- `src/story/game-master.test.ts:373` — affected consumer
- `src/assistant/prompt/sections/nsfw-policy.ts:24` — affected consumer

git issue: 7d8723d
