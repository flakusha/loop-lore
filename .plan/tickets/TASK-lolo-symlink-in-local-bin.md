<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: lolo symlink in ~/.local/bin

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-cross-platform-portability
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Create ~/.local/bin/lolo symlink to bin/lolo.ts (or bun link) as part of install/setup. Cross-platform: Windows has no ~/.local/bin. Under epic-cross-platform-portability. From Research-lolo-bin-softlink.md.

**Context:**

`lolo` does not resolve on PATH today. `bin/lolo.ts:1` carries a `#!/usr/bin/env bun` shebang and `package.json` declares `"lolo": "./bin/lolo.ts"` in its `bin` field, but Bun does not auto-link a root package's own `bin` for the project itself, so neither `~/.local/bin` nor `node_modules/.bin` contains a `lolo` entry. Users must type `bun run lolo`. The only user-owned `~/.local/bin` link precedent in the repo is giwt (`docs/giwt-scripts-map.md:14`), created manually.

Constraints:
- Unix-only path assumption: `~/.local/bin` does not exist on Windows. The install step must resolve the per-platform link directory (`%USERPROFILE%\.local\bin` on Windows) or skip the link and print the equivalent manual command.
- The shebang requires `bun` on PATH on every platform.
- A symlink into a mutable checkout drifts with git HEAD (the same problem giwt has). Prefer a pinned target (`node_modules/.bin` / an installed package path) over a bare working-tree symlink where possible; if the link points at the checkout, document the staleness caveat.

Alternatives considered: npm-style `postinstall` hook — rejected for now (deferred, larger surface, still needs the Windows branch); appending the repo `bin/` to PATH — rejected (shadows a user-owned `lolo` name and does not survive a repo move); adding a `lolo doctor` subcommand — rejected, `epic-first-run-auto-setup.md:48` lists a doctor CLI as an explicit anti-candidate.

**Acceptance Criteria:**

- [ ] An install/setup step (or a documented manual command) makes `lolo` invocable as a bare command on Linux/macOS
- [ ] Windows path is handled: the link directory is resolved per-platform and the step does not fail or silently no-op
- [ ] `lolo --help` (or the no-subcommand help output) works through the installed link
- [ ] Re-running the step is idempotent — an existing link is refreshed or reported, not duplicated or silently left stale
- [ ] Docs updated (`docs/guide/installation.md`, `docs/guide/getting-started.md`) with the install step, the Windows equivalent, and the staleness/version caveat
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
