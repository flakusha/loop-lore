# BUG: nsfwRuntimeConfig singleton leaks across test files

**Status:** 🟡 Identified, fix pending (pre-existing, exposed by feat-stabilize-high-value)
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

## Files involved

- `src/nsfw/runtime-config.ts` — singleton source (no `reset()` exposed)
- `src/routes/admin-nsfw.ts:20` — calls `updateRuntimeNsfwConfig`
- `src/routes/admin-nsfw.test.ts:82,94,106` — writes `{allowNsfw: false}`
- `src/story/game-master.test.ts:373` — affected consumer
- `src/assistant/prompt/sections/nsfw-policy.ts:24` — affected consumer