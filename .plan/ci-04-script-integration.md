# Plan: CI-04 CI/CD Integration with Package.json Scripts

## Goal

Align GitHub Actions workflows with existing `package.json` scripts, `bun run check`, and pre-commit hooks for consistent local/CI experience.

## Current State

### Package.json Scripts

```json
{
  "check": "bun run check:parallel",
  "check:parallel": "./scripts/check-parallel.sh",
  "check:ci": "./scripts/check-parallel.sh --ci",
  "check:fix": "./scripts/check-parallel.sh --fix",
  "check:full": "bun run build:frontend && bun run check",
  "lint": "eslint .",
  "lint:fix": "eslint . --fix",
  "format": "dprint check",
  "format:fix": "dprint fmt",
  "typecheck": "tsc --noEmit --project tsconfig.backend.json",
  "typecheck:frontend": "tsc --noEmit --project tsconfig.frontend.json",
  "typecheck:coverage": "type-coverage --strict --at-least 90 --project tsconfig.backend.json",
  "test": "bun test",
  "test:unit": "bun test src/",
  "test:e2e": "HTTP_PROXY= NO_PROXY=* bun test tests/e2e/",
  "test:e2e:browser": "for f in tests/e2e/flows/browser/*.browser.ts; do bun test --max-concurrency=1 \"./$f\" || exit 1; sleep 0.3; done",
  "commit:lint": "bun run src/scripts/commit-check.ts --all",
  "commit:check": "bun run src/scripts/commit-check.ts --staged"
}
```

### Pre-commit Hook (`.githooks/pre-commit`)

- Runs `bun run format:fix`
- Runs `bun run check`
- Runs `bun run test:unit`
- Runs `bun run test:e2e` (with `E2E_SAFEGUARD=1`)

### Scripts

- `scripts/check-parallel.sh` - Parallel runner with `--fix`, `--ci` flags
- `src/scripts/commit-check.ts` - Conventional commit validation

## Required Work

1. **Create `.github/workflows/ci.yml`** using exact package.json scripts:
   ```yaml
   jobs:
     quality:
       steps:
         - run: bun run check:ci
     test-unit:
       steps:
         - run: bun run test:unit:parallel
     test-e2e:
       steps:
         - run: E2E_SAFEGUARD=1 bun run test:e2e:browser
     build:
       steps:
         - run: bun run build
   ```

2. **Create `.github/workflows/pr-checks.yml`** for PR-specific checks:
   - Commit message validation: `bun run commit:check` (staged commits)
   - Runs on `pull_request` with `types: [opened, synchronize, reopened]`

3. **Sync Pre-commit with CI**:
   - Pre-commit runs `check` (lenient), CI runs `check:ci` (strict)
   - Document: `bun run check:fix` locally → fixes CI failures
   - Add `prepare` script to install hooks: `git config core.hooksPath .githooks`

4. **Add `ci` script to package.json** for convenience:
   ```json
   "ci": "bun run check:ci && bun run test:unit:parallel && E2E_SAFEGUARD=1 bun run test:e2e:browser && bun run build"
   ```

5. **Cache Optimization**:
   - Cache `node_modules` (bun install)
   - Cache `~/.bun/install/cache`
   - Cache `dist/` build output

6. **Environment Parity**:
   - Use same Bun version locally and in CI (specify in workflow)
   - Document Node.js version in `.nvmrc` / `.tool-versions`

## Acceptance Criteria

- [ ] `bun run check:ci` locally = `quality` job in CI (same exit codes)
- [ ] `bun run test:unit:parallel` locally = `test-unit` job in CI
- [ ] `E2E_SAFEGUARD=1 bun run test:e2e:browser` locally = `test-e2e` job in CI
- [ ] `bun run build` locally = `build` job in CI
- [ ] Pre-commit hook passes → CI passes (no surprises)
- [ ] `bun run check:fix` fixes all auto-fixable CI failures
- [ ] Commit message validation runs in CI on PR commits
- [ ] Bun version pinned in workflow matches local

## Dependencies

- CI-03 (required checks foundation)

## Effort

M (1-2 days)

## Files to Create/Modify

- `.github/workflows/ci.yml` (new)
- `.github/workflows/pr-checks.yml` (new)
- `package.json` (add `ci` script)
- `.github/workflows/ci.yml` (add Bun version, caching)
- `docs/spec/ci-cd.md` (document local/CI parity)
