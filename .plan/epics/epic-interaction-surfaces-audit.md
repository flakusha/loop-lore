<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Interaction Surfaces Audit — Headless CLI + Surface Parity

**Overview:** The app has one backend (single Elysia app: `src/server/index.ts` → `src/elysia-app.ts` → `src/routes/v1/*`) but no scriptable client: `lolo` is a TUI launcher (`-h` only), `src/cli/` is a parser library, and every scripted scenario needs hand-written HTTP. This epic makes the REST API drivable from scripts via a headless `lolo` CLI (`lolo chat|generate|assets|characters --json`, all **planned-new** — none of these subcommands exist today), then closes the highest-value parity gaps found by the audit (TUI, docs, plugin auth, runtime seeding).

**Status:** Not Started
**Priority:** High
**Effort:** Large
**Type:** Feature Epic
**Tags:** cli, headless, tui, docs, plugin-auth, seeding, dogfood
**Depends on:** none (consumes only the existing v1 REST API + `src/cli/parser.ts` house rule)

## Summary

Lead slice (this epic): non-interactive `lolo` subcommands with `--json` output covering scripted chat, headless generation, asset upload, and character create/import — unlocking dogfood steps 2–4 as scripts. Follow-up tickets: TUI parity (image-gen + avatar attach), docs drift, plugin auth surface, runtime seed endpoint.

## Scope (from `.tmp/interaction-surfaces-index.md`, gaps 1–5)

- Gap 1 — **No headless CLI** (lead slice): `TASK-headless-cli-chat-generate.md`, `TASK-headless-cli-assets-characters.md`
- Gap 2 — **TUI parity**: `TASK-tui-parity-imagegen-avatar.md`
- Gap 3 — **Docs drift**: `TASK-docs-drift-api.md`
- Gap 4 — **Plugin auth surface**: `TASK-plugin-auth-runtime-seed.md` (part A)
- Gap 5 — **No runtime seed endpoint**: `TASK-plugin-auth-runtime-seed.md` (part B)

## Explicitly deferred / out of scope

- Gap 6 — **WS dead code** (`src/transport/` unmounted; SSE is the only realtime transport): mount-or-remove decision deferred, no ticket.
- Gap 7 — **egui scope** (chat+gallery only, optional bundle): owned by `epic-experimental-egui-frontend` (In Progress), not this epic.
- Music/SFX/video generation: unimplemented in every surface (Web UI raises a not-implemented toast); not this epic.

## Acceptance

- `lolo chat|generate|assets|characters --json` (all **planned-new**) drive their v1 equivalents end-to-end against a solo-mode server and emit machine-parseable JSON (exit code + `error` field on failure).
- All 5 tickets Not Started → Done; no new server surface added except the explicitly planned-new runtime seed endpoint ticket.
- Dogfood steps 2–4 reproducible as shell scripts using only `lolo --json`.

## Tasks

- `TASK-headless-cli-chat-generate.md` — Not Started
- `TASK-headless-cli-assets-characters.md` — Not Started
- `TASK-tui-parity-imagegen-avatar.md` — Not Started
- `TASK-docs-drift-api.md` — Not Started
- `TASK-plugin-auth-runtime-seed.md` — Not Started
