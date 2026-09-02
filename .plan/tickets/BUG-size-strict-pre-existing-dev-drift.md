<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: size-strict pre-existing dev drift

**Status:** ⬜ Not Started
**Priority:** Medium
**Epic:** epic-code-quality.md

## Summary

**What**

45+ files exceed the 250L (or 300L for 300-tier) soft limit on `dev`, causing `size - strict` gate to fail in CI. These are pre-existing drift, not introduced by any single worktree. Finalize of the wardrobe epic (commit `651854da`) had to use `--force` because of this.

**Affected files (45+):**

- src/utils/date.ts (256L)
- src/story/items/instances.ts (267L)
- src/story/events/extraction.ts (264L)
- src/services/trade/index.ts (276L)
- src/server/static-files.ts (276L)
- src/scripts/version-bump.ts (273L)
- src/rpg/npc-navigation/service/processing.ts (262L)
- src/rpg/integration-registry/queries.ts (264L)
- src/rpg/fantasies/service/crud.ts (274L)
- src/rpg/crafting/process.ts (286L)
- src/routes/message-seen.ts (289L)
- src/routes/worlds/locations.ts (291L)
- src/routes/story-items/handlers.ts (255L)
- src/routes/quests/handlers.ts (263L)
- src/routes/messages/post.ts (274L)
- src/routes/auth/login.ts (258L)
- src/plugins/registry.ts (259L)
- src/nsfw/moderation-service/flags.ts (311L — over 300L tier)
- src/middleware/csrf.ts (295L)
- src/middleware/idempotency.ts (270L)
- src/middleware/response-headers.ts (268L)
- src/generation/providers/comfyui.ts (251L)
- src/generation/providers/registry.ts (265L)
- src/generation/providers/openai-compatible/http.ts (262L)
- src/generation/hooks/moderation-hook.ts (251L)
- src/generation/generate-route/handler.ts (274L)
- src/generation/generate-route/stream-to-client.ts (375L)
- src/generation/cancellation-tracker/lifecycle.ts (281L)
- src/generation/auto-gen/auto-generation.ts (251L)
- src/frontend/ui.ts (273L)
- src/frontend/pages/characters-traits.ts (270L)
- src/config/templates-loader/validation.ts (271L)
- src/characters/steganography.ts (259L)
- src/characters/services/emotion-avatar-service/generation.ts (260L)
- src/assistant/prompt-assembler.ts (263L)
- src/assistant/commands/review.ts (256L)
- src/assets/metadata.ts (274L)
- src/assets/controller/handlers.ts (266L)
- src/assets/controller/serve.ts (304L — over 300L tier)
- src/chat/music-links.ts (251L)

Run `bun run scripts/check-file-size.ts --strict` for the canonical list (test files exempt, 250L soft / 300L tier / 200L AGENTS.md target).

**Why**

Per `AGENTS.md`: "<200L AGENTS.md convention, 250L soft limit". The `size - strict` CI gate (`scripts/check-parallel.mjs`) fails the check pipeline. `scripts/check-file-size.ts --strict` exits 1 for any file over the limit. `*.test.ts` and `migrations/` are excepted.

The wardrobe epic (commit `651854da`, 2026-09-02) bypassed this gate via `--force` finalize after explicit user approval. Subsequent worktrees will face the same gate failure.

**Where**

- `scripts/check-file-size.ts` (gate logic, `// @size:allow=N` escape valve)
- `scripts/check-parallel.mjs` (gate wiring: `size - strict`)
- 45+ individual source files

**How to fix**

For each oversized file, either:

1. **Split** into smaller modules per the AGENTS.md 200L convention (preferred for files > 280L).
2. **Apply** the existing per-file escape valve `// @size:allow=N` in the file header (last resort; e.g. switch statements with many cases, large declarative tables).

Prefer splitting over `@size:allow`. The `@size:allow` directive exists exactly for the "known violation that isn't being actively worked on" case — apply it generously to files that are intentionally large, sparingly to files that drifted.

**Acceptance**

- `bun run scripts/check-file-size.ts --strict` exits 0
- No file over 250L without `// @size:allow=N` directive in header
- All existing tests pass
- Gate goes green in CI without `--force` finalize

**Related**

- Wardrobe epic finalize: commit `651854da` (forced)
- AGENTS.md: "<200L AGENTS.md convention, 250L soft limit"
- `scripts/check-file-size.ts`: line 49 (`*.test.ts`/`migrations/` exempt)

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
