<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: config schema defaults leak absolute paths

**Status:** ✅ Done
**Priority:** Medium
**Epic:** epic-api-validation-guardrails.md

## Summary

**What**

`s schemas/loop-lore-config.schema.json` defaults contain absolute filesystem paths that leak the worktree name into the published artifact:

```
"default": "/home/flak/git-ai/loop-lore/tree/plan-wardrobe-loadouts/loop-lore-data/certs/key.pem"
"default": "/home/flak/git-ai/loop-lore/tree/plan-wardrobe-loadouts/loop-lore-data/certs/cert.pem"
"default": "/home/flak/git-ai/loop-lore/tree/plan-wardrobe-loadouts/loop-lore-data/loop-lore.db"
"default": "/home/flak/git-ai/loop-lore/tree/plan-wardrobe-loadouts/loop-lore-data/uploads"
```

These are captured when the config schema emitter (`bun run src/config/generate-schema.ts`) runs in a worktree with a worktree-specific data directory. The path-leak predates the wardrobe epic — earlier commit `5dd6ff40` (XSS batch) had paths under `tree/character-bugfix-batch/...`; the wardrobe epic re-ran the regen and updated to `tree/plan-wardrobe-loadouts/...`.

**Why**

The `schemas:check` gate is structural only — it does not detect path drift. Each worktree regen replaces the absolute path with the current worktree's path, churning the diff and committing machine-specific paths to a published artifact. External consumers (editors, docs) will see a path that doesn't exist on their filesystem.

Per AGENTS.md ("Never create git tags... agents prepare release artifacts... but stop at tagging"), published artifacts must be release-ready. Absolute paths with worktree names are not portable.

**Where**

- `schemas/loop-lore-config.schema.json` lines 31, 39, 69, 93 (and any other absolute paths in `default:` properties)
- `src/config/schema-class/json-schema/server.ts`, `db.ts`, `assets.ts` (or wherever defaults are read from `src/config/sections/...`)
- `src/config/sections/server/defaults.ts` (likely source of TLS/db path defaults)
- `scripts/check-schemas.ts` (gate does not flag path drift)

**How to fix**

1. Audit every `default:` string in `schemas/loop-lore-config.schema.json` for absolute paths.
2. For path defaults, switch to either:
   - **Relative paths** resolved against `DATA_DIR` (env var) at runtime (e.g. `"default": "loop-lore-data/certs/key.pem"` or `"default": "./loop-lore-data/certs/key.pem"`)
   - **Placeholders** that document the expected location but don't commit to a specific tree path (e.g. `"default": "${DATA_DIR}/certs/key.pem"`)
3. Update `src/config/sections/{server,db,assets}/defaults.ts` to emit the new (portable) defaults.
4. Re-run `bun run src/config/generate-schema.ts` and verify the diff in `schemas/loop-lore-config.schema.json` is now portable.

**Acceptance**

- No absolute filesystem path containing `/home/` or `/Users/` or worktree names in `schemas/loop-lore-config.schema.json`
- Path defaults are relative, env-var-substituted, or documented placeholders
- `bun run scripts/check-schemas.ts` green
- No regression in path resolution at runtime (smoke-test `bun run smoke-app` or equivalent)

**Related**

- Wardrobe epic: commit `651854da` (re-ran schema regen, captured current worktree path)
- `configs/config.example.{toml,yaml}`: same path-leak issue likely present — should be checked together
- AGENTS.md: "Never create git tags... agents prepare release artifacts (changelog, release-process docs) but stop at tagging."

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Verified against src/ in ticket-closeout-audit: no /home/ hits in loop-lore-config.schema.json; defaults portable.
