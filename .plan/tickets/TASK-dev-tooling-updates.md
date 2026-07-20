# TASK: Dev Tooling Updates — Biome, dprint, stylelint

**Status:** ⬜ Not Started
**Priority:** Medium (chore)
**Effort:** Low

## Summary

Update dev tooling to latest versions. Isolated from other changes — no functional impact.

## Versions

| Tool | Current | Target | Notes |
| ---- | ------- | ------ | ----- |
| `@biomejs/biome` | (current) | 2.5.4 | Linter/formatter |
| `dprint` | (current) | 0.55.2 | Additional formatter |
| `stylelint` | (current) | 17.14.1 | CSS linting |

## Tasks

- [ ] Update `@biomejs/biome` to 2.5.4 in `package.json`
- [ ] Update `dprint` to 0.55.2 in `package.json`
- [ ] Update `stylelint` to 17.14.1 in `package.json`
- [ ] Run `bun install` and verify lockfile updates
- [ ] Run `bun run check` — ensure no new lint/format errors
- [ ] Fix any breaking changes from version bumps
- [ ] Commit with `chore(deps): update dev tooling`

## Risk

Low — dev-only tools, no runtime impact. Breaking changes possible but unlikely for minor/patch bumps.
