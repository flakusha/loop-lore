<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Configs Path Resolution — File-Relative Paths + Windows/macOS Parity

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Infrastructure Epic
**Tags:** config, paths, resolution, cross-platform, windows, macos, cwd

## Summary

Make config path resolution independent of the process working directory (`cwd`) and portable across Windows and macOS:

1. **File-relative resolution (highest priority)** — relative paths inside a `configs/` file (and paths derived from it: templates, characters, workflows, asset/upload dirs, model paths) must resolve against the **config file's own location** (or the `configs/` root it lives under), **not against the application `cwd`** the process happened to start in.
2. **Windows/macOS path handling** — every path touch-point in config loading and config-driven path consumption must use platform-aware `node:path` semantics (`sep`, `isAbsolute`, `win32`/`posix` variants) and support Windows (`C:\…`, `\`) and macOS (`/Users/…`) path shapes alongside Linux.

## Current State Assessment

### Cwd-anchored config discovery

The entire config load pipeline is anchored to `process.cwd()` (or the caller-supplied `cwd`):

- `src/config/load/load.ts:20-21` — `loadConfig()` defaults `directory = process.cwd()`; every lookup (`findConfigFile`, `loadDomainConfigs`, `loadTemplateConfig`, env.yaml) is `cwd`-relative. Only worktree-aware fallback exists (`findMainRepoRoot`, `src/config/load/fs.ts:60-93`).
- `src/config/load/fs.ts:97-101` — `findConfigFile` searches `[cwd, cwd/configs]` (+ main root), never the location of a file that references configs.
- `src/config/load/domain.ts:20,26` — `loadDomainConfigs` joins `directory/configs/config.<domain>.<ext>`.
- `src/config/templates-loader/index.ts:31-33` — `loadTemplateConfig` defaults to `process.cwd()`.
- `src/config/character-loader.ts:43-50,180` — character config discovery searches `cwd/configs/characters` / `cwd/characters` (+ main root).

Consequence: running the app from a different directory (service managers, packaged builds, IDE launch configs, `bun run` from repo subdirs) silently loads a different config set or fails to find files, and any relative path inside a config resolves against the wrong root.

### Cwd-anchored config path-value consumption

Path **values** read from config resolve against `process.cwd()` at consumption time:

- `src/assets/service/file-system.ts:17-19` — `resolveUploadDir` joins `process.cwd()` for relative upload dirs.
- `src/generation/workflow-loader/loader.ts:197-199` — workflow dir resolved against `process.cwd()`.
- `src/services/server-external-manager/start-sd.ts:51-55` / `start-llama.ts:52` — model/vae/llm paths `resolve()`d against cwd.
- DB filename / DATA_DIR handling (`src/config/constants.ts:8-9` is already file-relative; `src/db/reinit.ts:21` still mixes `process.cwd()`).

### Platform coupling (Windows/macOS blockers)

- `src/assets/service/file-system.ts:23-28` — path-traversal guard hardcodes `/home` and `/` (Linux-only). Already tracked as `TASK-cross-platform-filesystem-path-guard.md` (T1.2 in `epic-cross-platform-portability.md`) — this epic inherits/co-locates the config-side work.
- `src/config/load/fs.ts:11-50` — `isNetworkFilesystem` uses `NETWORK_FS_PREFIXES` + `/proc/mounts` (Linux-only; `/proc` absent on Windows/macOS).
- `src/config/load/fs.ts` gitdir parsing (`/^gitdir:\s*(.+)$/`) — worktree `.git` file path may contain Windows drive letters / backslashes; parsing must be platform-aware.
- `src/config/cert.ts:13` — `platform` already used for `openssl.exe` (portable pattern to mirror).

## Scope

- Introduce a single resolution anchor: relative paths resolve against the owning config file's directory (or the nearest `configs/` root), never `process.cwd()`. Provide an explicit, documented rule for `config.<domain>.*` files vs `configs/templates/*` vs `configs/characters/*` vs nested workflow files.
- Replace every cwd-relative lookup in config discovery + consumption with the anchor-based resolver.
- Make `isNetworkFilesystem`, the filesystem path guard, and gitdir parsing platform-aware (`node:path` only; no `/proc` assumptions; Windows drive letters; macOS `/Users`).
- Keep backward compatibility: when a path is absolute or already config-root-relative, behavior must not change; tests pin existing semantics first.
- Do NOT change config file formats or schema — resolution semantics only.

## Implementation Phases

### Phase 1 — File-Relative Resolution Core

- [ ] T1.1 Audit + catalog every `process.cwd()` / cwd-relative path touch-point in `src/config/` and config-driven consumers (enumerated above; extend with grep-driven audit)
- [ ] T1.2 Introduce anchor-aware resolver (e.g. `src/config/load/resolve.ts`) — `resolveFromConfigFile(filePath, value)` and `resolveFromConfigsRoot(dir, value)`; absolute values pass through
- [ ] T1.3 Wire discovery: `findConfigFile`, `loadDomainConfigs`, `loadTemplateConfig`, `loadCharacterFiles` resolve relative to the config root they discover, not caller `cwd`
- [ ] T1.4 Wire consumption: upload dir, workflow dir, sd/llama model paths, db filename resolve via anchor
- [ ] T1.5 Keep worktree fallback (`findMainRepoRoot`) but make it anchor-relative, not cwd-relative

### Phase 2 — Windows/macOS Parity

- [ ] T2.1 Replace `/home` + `/` guard in `src/assets/service/file-system.ts` with `node:path` `sep`/`isAbsolute` (coordinate with `TASK-cross-platform-filesystem-path-guard.md`; do not duplicate)
- [ ] T2.2 Make `isNetworkFilesystem` non-Linux-safe (guard `/proc` reads; platform-aware mount detection or documented fallback)
- [ ] T2.3 Platform-aware worktree gitdir parsing (Windows drive letters, backslashes)
- [ ] T2.4 Unit tests asserting Windows (`C:\Users\…`, `\`), macOS (`/Users/…`), and Linux path shapes through the resolver + guard

### Phase 3 — Verification & Docs

- [ ] T3.1 Config load tests run from a non-repo cwd (e.g. `/tmp`) proving file-relative resolution
- [ ] T3.2 Document resolution rule in `docs/guide/` (config path semantics + Windows/macOS notes)
- [ ] T3.3 Full `bun run check` + `bun test src/` green; CI matrix on Windows/macOS (coordinate with `epic-cross-platform-portability.md` T1.6)

## Files (proposed)

- `src/config/load/resolve.ts` (new) — anchor-aware path resolution
- `src/config/load/load.ts`, `src/config/load/fs.ts`, `src/config/load/domain.ts` — discovery wiring
- `src/config/templates-loader/index.ts`, `src/config/character-loader.ts` — template/character discovery
- `src/assets/service/file-system.ts` — OS-aware guard (with existing T1.2 ticket)
- `src/generation/workflow-loader/loader.ts`, `src/services/server-external-manager/start-sd.ts`, `start-llama.ts` — path-value consumption
- `src/config/load/parse.ts`, `src/db/reinit.ts` — cwd removal sweep
- `src/config/load/*.test.ts`, `src/config/*.test.ts` — per-platform path tests

## Testing Strategy

| Test       | Coverage                                                                        | Files                                                                        |
| ---------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Unit       | Load config from non-repo cwd; relative values resolve against config file root | `src/config/load/load.test.ts`, `src/config/domain-configs.test.ts` (extend) |
| Unit       | Path shapes: win32 / darwin / linux through resolver + guard                    | `src/config/load/resolve.test.ts`, `src/assets/service/file-system.test.ts`  |
| Regression | Existing cwd-based tests still green (default cwd path)                         | `bun test src/`                                                              |
| CI         | Windows + macOS runner matrix (config load suite)                               | CI workflow (with portability epic T1.6)                                     |

## Linked Tasks

- `FEAT-configs-path-resolution-file-relative-windows-macos-parity.md` (umbrella — this epic, git issue `b2ed9d6`)
- `TASK-cross-platform-filesystem-path-guard.md` (existing — T2.1 overlap)

## Related Epics

- `epic-cross-platform-portability.md` — Windows/macOS portability umbrella; path guard (T1.2), CI matrix (T1.6)
- `epic-config-file-separation.md` — domain config layout this epic's discovery depends on
- `epic-config-extensions.md` — extensible enumerations; path-value schema implications
- `epic-data-integrity-phase1.md` — config guards precedent
