<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Tests delete app-installed globals, breaking every later test file

**Status:** Done
// hint: Structural and logic conflict. Both design and behavior differ.
**Priority:** low
**Effort:** Done

**Summary:**

Five frontend test files `delete` globals that production modules install, rather than restoring the load-time value. This was filed as a `high` defect on the claim that it broke later test files. **That claim is false** — see Verification. The defect is latent: the hygiene violation is real, but no test ever failed because of it and none can, given how the consumers are written.

What was changed (commit 26b877a0e): each file now snapshots the global at module load and restores it in `afterEach`/`afterAll`, keeping the original `delete` where it is load-bearing (render.test.ts's `clearMarkdownLibs` and composer-pre-send.test.ts's `clearPreviewSanitizer` are called as preconditions to assert the fail-safe path when the libs are absent).

Globals in scope and their production installer:
- `__DOMPurify` / `__marked` — src/frontend/chat-vendor.ts
- `__localeStrings` — src/frontend/ui.ts, src/frontend/alpine/app.ts, src/routes/views/layout.ts
- `__THEMES` — src/frontend/alpine/theme.ts
- `loadNewChatPage` — src/frontend/pages/new-chat/index.ts
- `__previewAsset` — src/frontend/asset-preview.ts, src/frontend/alpine/chat-utils/gallery.ts

Affected teardowns:
- src/frontend/alpine/chat-utils/render.test.ts:50-51 (clearMarkdownLibs)
- src/frontend/alpine/composer-pre-send.test.ts:423 (clearPreviewSanitizer)
- src/frontend/ui.test.ts:251-252 (beforeEach)
- src/frontend/alpine/htmx.test.ts:465,476
- src/frontend/alpine/chat-utils/gallery.test.ts:423

src/frontend/app-globals.test.ts enforces the invariant going forward: a test file that deletes one of these globals without a matching restore fails.

**Context:**

The original claim rested on a two-file probe. That probe was invalid: the victim file imported `src/frontend/chat-vendor` itself, and that module assigns `globalThis.__marked` / `__DOMPurify` unconditionally at top level (src/frontend/chat-vendor.ts:14-15), so importing it re-installed the very global the probe claimed to observe as missing. A correct probe that does not import the installer shows the global is `undefined` in a bare `bun test` run regardless of any leaker.

**Verification (2026-10-01):**

- Full frontend suite without `--isolate`, before vs after: 1578 pass / 12 fail → 1579 pass / 12 fail. The `+1` is the new `app-globals.test.ts` counting itself; the failing-test-name set is byte-identical. The fix changed no observable behavior.
- No production code installs these globals during a test run. The consumers never depend on a pre-existing value: render.test.ts and music-embed.test.ts both install their own fakes.
- The one genuinely vulnerable production shape is `src/frontend/alpine/chat-utils/render.ts:9-10`, which reads `globalThis.__marked` / `__DOMPurify` through lazy getters and never imports the installer. It degrades to its fail-safe escaping path, which is the intended behavior when the sanitizer is absent — so a leaked delete cannot produce a wrong test result, only a different code path.
- The 12 shared-process failures are pre-existing and unrelated (chatEditing API flows, characters page, locale-string guard).

**Conclusion:** keep the restores as test hygiene and to remove a latent trap. Do not cite this ticket as evidence of a fixed production or test defect.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing (no regression: failure set unchanged)
- [x] Documentation updated (this correction)
