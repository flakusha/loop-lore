<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Close the i18n command-registry gap and add a runtime-registry gate

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-i18n
**Tags:** i18n, commands

**Summary:**

`en.json` carries 80 `commands.*` keys against 86 registered command names: 78 static plus 8 loop-registered — `orchestrate`/`workflowz`/`omp` in `src/assistant/commands/harness-verbs.ts:37-51` and `evaluate`/`forage`/`hide`/`persuade`/`study` in `src/rpg/interaction/catalog.ts:27-67`. Exactly 6 registered names lack keys: `avatar`, `image`, `music`, `sfx`, `sound`, `video`. All six are registered and availability-gated — they are NOT orphans, and no key may be removed for them.

This ticket supersedes TASK-command-palette-descriptions-are-raw-i18n-keys-for-43-of-the.md. That ticket states 33 keys / 43-of-70 missing / 6 orphans — all three numbers are wrong against the current tree (80 keys present, 86 registered, 6 missing, 0 orphans). Its removal direction (`image, video, sfx, sound, music, clear`) would delete descriptions for live commands; do the opposite: add the 6 missing keys.

Scope: add the 6 `commands.<name>` keys to `src/public/locales/en.json` (and regenerate the other locale catalogs from the updated English source, per existing convention); extend the existing i18n check (`scripts/check/i18n-keys.mjs` — extend, no new script) so the runtime registry vs locale-key agreement is gated, covering loop-registered names (measure against the RUNTIME registry, never a static `registerCommand` grep — the static scan misses loop-registered names).

**Caveats:** TOCTOU: keys are build-time catalog data; no runtime race. Security: description strings only; no user input. Authorization: n/a — display text. Parallelism: catalog regeneration is a single-file write; no shared state. Partial failure: a missing key renders the raw key, never a crash — the gate exists to catch that before ship. Rollback: key additions are additive; removal restores prior rendering. Observability: the extended check reports the offending command name.

**Context:**

Why not delete: the six names resolve to registered, availability-gated commands — deleting their keys (or the keys' commands) would regress live palette entries. The gap is coverage, not dead code.

**Acceptance Criteria:**

- [ ] The 6 missing `commands.<name>` keys (`avatar`, `image`, `music`, `sfx`, `sound`, `video`) exist in `en.json` and the other locale catalogs are regenerated from it.
- [ ] `scripts/check/i18n-keys.mjs` fails when a registered command (static or loop-registered) has no `commands.<name>` key, and passes when they agree.
- [ ] No existing key is removed.
- [ ] The superseded ticket's removal direction is explicitly NOT implemented.

**Related:** TASK-command-palette-descriptions-are-raw-i18n-keys-for-43-of-the.md, epic-i18n.md
