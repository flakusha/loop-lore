# Contributing to loop-lore

Thank you for your interest in contributing!

## Quick Start

```bash
# Fork and clone
git clone https://github.com/yourname/loop-lore
cd loop-lore

# Install hooks (required for commit validation)
git config core.hooksPath .githooks

# Install dependencies
bun install

# Run checks
bun run check  # typecheck + lint + format
bun test        # unit tests
```

## Commit Guidelines

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): short description (≤72 chars)
```

Types: `feat`, `fix`, `refactor`, `chore`, `test`, `docs`, `style`, `perf`, `build`, `ci`

Example:

```
feat(assets): add image upload endpoint
fix(db): correct chat participant FK
```

## Pull Request Process

1. Create feature branch from `master`
2. Make changes with valid commits
3. All CI checks must pass (`bun run check`, tests)
4. Open PR to `master`

### PR Title Format

Use conventional commit format in PR titles:

- `feat(core): add SSE streaming`
- `fix(assets): correct file path validation`

### PR Checklist

- [ ] `bun run check` passes
- [ ] Tests added/updated for changes
- [ ] Documentation updated if needed

## Development Branches

| Branch      | Purpose                  |
| ----------- | ------------------------ |
| `master`    | Main development         |
| `release/0` | 0.x maintenance          |
| `release/1` | 1.x maintenance (future) |

## Documentation

- CI maintenance: `docs/spec/ci-maintenance.md`
- Architecture: `docs/spec/architecture.md`
- API routes: `docs/spec/api-routes.md`

## Questions?

Open an issue with the "question" label or start a discussion.
