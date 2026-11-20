<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Command palette descriptions are raw i18n keys for 43 of the 70 runtime-registered commands

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-i18n
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Historical premise (43 of 70 raw keys) is already fixed on dev; this ticket is closed with evidence below. The runtime-registry assertion now lives in the i18n static-key gate.

## Summary

`src/routes/commands/index.ts` mints `commands.<name>` at runtime. Verified on dev: every runtime-registered command resolves to a `commands.*` key in `src/public/locales/en.json`; no key is orphaned.

`scripts/check/i18n-keys.mjs` now imports the live assistant registry (`listAllCommands`) and fails on any unkeyed command; the static extractor's template/concatenation blind spot no longer matters for this path.

The gate measures the runtime registry, including loop-registered harness verbs and RPG interaction commands; a static `registerCommand("...")` grep misses those.

## Scope

- [x] Every runtime command resolves to a `commands.<name>` key in `en.json` (verified on dev).
- [x] Locale catalogs are consistent; `bun run i18n:fix` is the propagation path when keys change.
- [x] No orphan `commands.*` keys remain; the former "orphan" list was measured wrongly.
- [x] `scripts/check/i18n-keys.mjs` asserts against the live registry and fails on an unkeyed command.

## Acceptance Criteria

- [x] Every runtime command resolves to a `commands.<name>` key; gate uses the live registry, not a static scan.
- [x] `scripts/check/i18n-keys.mjs` fails on an unkeyed registered command.
- [x] No orphan `commands.*` keys remain (the original orphan list was a measurement error).
- [x] Locale catalogs needed no regeneration for this closeout.
- [x] Targeted verification: `bun scripts/check/i18n-keys.mjs` green; `bun run check --gates "i18n - static keys"` green.
- [x] No code change required on dev — the fix already shipped.

**Context:**

Closeout 2026-11-20: measured dev directly — runtime registry and `en.json` command keys match with no missing or orphan entries, and the gate's runtime assertion is present. Original counts (70/43/33/6) were stale; corrected here rather than reimplementing shipped work.

**Acceptance Criteria:**

- [x] Implementation complete on dev before this closeout
- [x] Targeted gate green (i18n static keys)
- [x] Ticket premises corrected in place
