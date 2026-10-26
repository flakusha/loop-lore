<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Delete duplicate config schema/shim layers, dead config emitters and one-shot migration

**Status:** Not Started
**Status Note:** [2026-10-26] EVIDENCE SOURCE GONE: this ticket cites `.tmp/simplification/*.md`, deleted by a .tmp cleanup on 2026-10-12 and never git-tracked (verified unrecoverable — see BUG-simplification-audit-artifacts-lost-to-a-tmp-cleanup-13-tick / dd8e139). Every count, finding number, or ranking taken from those citations is UNSOURCED; re-derive against the current tree before acting. The ticket's substance (file:line scope lists, MUST RETAIN lists, re-derive commands) stands on its own; only the audit citations dangle.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-schema

**Summary:**

Collapse the parallel config type/shim layers onto src/config/sections, delete the superseded one-shot schema emitters and the finished config.toml migration, and drop the write-only config keys. Research: the platform slice of the over-engineering audit (scratch, not on disk). Re-derive with 'bun run dead:code:src'.

**Context:**

`src/config/sections/` is already the single source of truth — `src/config/schema-class/index.ts:1-15`
says so in its own header ("Single source of truth … Replaces hand-duplicated …"). Three parallel
layers sit on top of it and duplicate what the `*Section` classes already declare. Source:
the platform slice of the over-engineering audit (scratch, not on disk) — findings "`delete:` `src/config/schema/`", "`yagni:` the parallel
`src/config/schema-class/` shim layer", "`delete:` the four config generators", "`delete:`
`src/config/migrate-config.ts`", plus the three write-only-key findings. Re-derive with
`bun run dead:code:src`.

**Scope — deletions:**

- `src/config/schema/` — `index.ts:1-40` plus its 34 siblings. Every "REAL" file is a hand-written
  interface/const re-declaring a `*Section`; every "ALIAS" file is literally
  `export type XConfig = InstanceType<typeof XSection>`. Largest: `auto-start.ts`, `seeding.ts`,
  `generation.ts`, `providers.ts`, `integrations.ts:19-30`.
- `src/config/schema-class/{age-gate,assets,assistant,auth,byo-key,cron,db,docs,dynamic-response,encryption,generation,integrations,logging,messages,nsfw,seeding,server,tui}.ts`
  and `src/config/schema-class/json-schema/*.ts` — pure re-export shims; fold the re-exports into
  `src/config/schema-class/index.ts` and delete the files.
- `src/config/generate-schema.ts:1-36`, `generate-env-schema.ts:1-27`,
  `generate-toml-schema.ts:1-141`, `generate-domain-schemas.ts:1-94` — superseded by
  `src/config/schema-class/index.ts`'s `jsonSchema()` / `envMap()` / `envJsonSchema()`, which
  `scripts/check-schemas.ts` already calls to gate staleness.
- `src/config/migrate-config.ts:1-223` — one-shot migration for the monolithic `config.toml` split
  that `configs/` (config.transport.toml, config.messages.toml, …) already completed.
- Autonomy config trio with zero importers: `src/config/schema/autonomy.ts`,
  `src/config/schema-class/autonomy.ts`, `src/config/schema-class/json-schema/autonomy.ts`.

**Scope — write-only config keys (declared, mapped, serialized, read nowhere):**

- `config.messages`: `autoHideInvalid`, `hideConfirmation`, `maxGenerationRetries`,
  `generationTimeoutMs` — `src/config/sections/messages.ts:7-11`,
  `src/config/schema-class/env-map.ts:144-148`, `configs/config.messages.toml:5-9`.
- `config.integrations`: `discord`, `appservice`, `smtpHost`, `smtpPort` —
  `src/config/sections/integrations.ts`, `src/config/schema/integrations.ts:19-30`,
  `src/config/schema-class/env-map.ts:184-199`.
- The `config.transport` keys belong to the transport-deletion ticket, not this one.

**Evidence:**

- `grep -rn 'from "[^"]*config/schema"' src tests scripts` → every hit resolves through
  `../sections/<name>`; no importer depends on the hand-written mirrors.
- `grep -rn 'from "[^"]*schema-class/<name>"' src tests scripts` for each of the shim names → 0 hits;
  `grep -rn 'from "[^"]*json-schema' src tests scripts` → exactly one line,
  `src/config/schema-class/index.ts:141` (the barrel itself).
- `grep -rn "migrate-config" src tests scripts package.json` → only self-references and its own
  `programName` string; it is not in `package.json` scripts, so it is not runnable as documented.
- `grep -c "generate-domain-schemas" package.json` → 0; `grep -n "config:generate" package.json`
  shows the other three generators still have scripts, so drop those scripts in the same change.
- `grep -rn "autoHideInvalid|hideConfirmation|maxGenerationRetries|generationTimeoutMs" --include=*.ts --include=*.toml src tests scripts configs`
  → hits only under `src/config/` and `configs/`; zero reads in `src/` outside config.
- `grep -rn "config.integrations.(discord|appservice)|smtpHost|smtpPort" src tests scripts` outside
  `src/config/` → 0 hits; the only `integrations.` reference in prod code is a prose comment at
  `src/integrations/email/adapter.ts:12`.

**Caveats / constraints:**

- This is the *follow-through* work for closed ticket `TASK-single-source-of-truth-for-config-schema-mirrors`
  (D3 decision 2026-09-03: mirrored structures MUST derive from one source of truth). That ticket is
  closed but the mirror layers are still on disk, so this is deletion, not re-litigating the decision.
- Deleting `src/config/schema/` means repointing its importers at `src/config/sections/`. Do that with
  a path-preserving re-export if it keeps the diff mechanical; do not hand-edit hundreds of call sites.
- The three JSON-schema emitters are guarded by `scripts/check-schemas.ts`. Keep that gate green
  before and after — if a gate reads `generate-*.ts`, repoint it, do not delete the check.
- Removing the config keys is a config-surface break: check `docs/` and any deployment env sample for
  `LOGS_*`/`MESSAGES_*`/`INTEGRATIONS_*` references before cutting, and keep
  `configs/config.messages.example.toml` in sync.
- `src/integrations/` ships exactly one adapter (email) and never reads `integrations.email.*` either —
  that half is a separate observation, not in scope here.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
