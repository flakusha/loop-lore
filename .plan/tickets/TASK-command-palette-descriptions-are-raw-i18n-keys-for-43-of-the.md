<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Command palette descriptions are raw i18n keys for 43 of the 70 runtime-registered commands

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-i18n
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

The command palette prints the raw i18n key as the description for 43 of the 70 runtime-registered commands, and the i18n gate cannot see it.

## Summary

src/routes/commands/index.ts:60 mints descriptionKey: `commands.${name}` at runtime. en.json carries only 33 commands.* keys, so 43 of the 70 runtime-registered commands resolve to a missing key and the palette renders the raw key as the description.

scripts/check/i18n-keys.mjs:95,99 skips template-literal and concatenated keys, so the gate never inspects these runtime-minted keys — that is why the gap survived.

IMPORTANT: measure against the RUNTIME registry (70 commands), never a static registerCommand("...") grep — a static scan sees only 67 names because src/routes/commands/harness-verbs.ts:152 and src/routes/commands/interaction.ts:182 register in loops.

## Scope

- Add the missing commands.`<name>` keys to src/public/locales/en.json.
- Regenerate the other locale catalogs from the updated English source.
- Drop the 6 orphan commands.* keys in en.json that have no runtime command: image, video, sfx, sound, music, clear.
- Assert in scripts/check/i18n-keys.mjs that every command in the runtime registry resolves to a commands.`<name>` key, so the gate fails when a command is registered without a description.

## Acceptance Criteria

- [ ] Every command in the runtime registry resolves to a commands.`<name>` key in en.json; the assertion runs against the runtime registry, not a static source scan.
- [ ] scripts/check/i18n-keys.mjs fails when a registered command has no description key.
- [ ] The 6 orphan commands.* keys with no runtime command are removed from en.json.
- [ ] The other locale catalogs are regenerated from the updated English source.
- [ ] Tests passing
- [ ] bun run check passes

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
