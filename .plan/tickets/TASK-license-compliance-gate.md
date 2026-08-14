# TASK: License compliance gate — scancode + fossa in bun check

**Status:** ✅ Done
**Priority:** high
**Effort:** Small
**Epic:** epic-code-quality.md

## Summary

Integrate `scancode` (Apache-2.0) and `fossa` (CPAL-1.0) into `bun check` to
enforce LGPL purity in `src/` — no GPL or AGPL code allowed.

Both tools are FOSS. scancode scans source files for license headers/content;
fossa scans the dependency tree. The wrapper script (`scripts/check-licenses.ts`)
runs both in parallel, flags GPL/AGPL violations, and reports.

## Acceptance Criteria

- [x] `scripts/check-licenses.ts` — wrapper for scancode + fossa
- [x] `.fossa.yml` — FOSSA config with LGPL-allowlist policy
- [x] `package.json` — `license:check`, `license:check:strict`, `license:install:*` scripts
- [x] `scripts/check-parallel.mjs` — license gate in non-blocking checks
- [x] Graceful skip when tools not installed (exits 0, shows install instructions)
- [x] Strict mode via `LICENSE_CHECK=1` or `--strict` flag
- [x] dprint + eslint clean

## Notes

- scancode: `pip install scancode-toolkit`
- fossa: `curl -H 'Cache-Control: no-cache' https://raw.githubusercontent.com/fossas/fossa-cli/master/install-latest.sh | bash`
- `fossa analyze --output` works without API key (output mode disables telemetry/upload)
- API key only needed for `fossa test` (dashboard upload)
- Non-blocking by default; move to blocking `checks` object in `check-parallel.mjs` when tools are installed in CI
