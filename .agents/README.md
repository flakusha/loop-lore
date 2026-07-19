# `.agents/` — Agentic Development Standard

Agent-agnostic convention for project-local agent context. Works with **any** AI
coding tool: Claude Code, OpenCode, Cursor, Copilot, Aider, Codex, etc.

## Why `.agents/`

Agents need project context to be useful. Historically each tool invents its own
dot-directory (`.claude/`, `.config/opencode/`, `.cursor/`, `.copilot/`),
fragmenting project configuration across tool-specific silos.

`.agents/` is the **universal adapter** — one standard that any agent tool can
consume, with adapters/rules mapping it to each tool's native format.

## Directory Structure

1. **`README.md`** — This file, the standard spec.
2. **`skills/`** — SKILL.md files defining agent skills:
   - `project-context/` — High-level project overview.
   - `db-schema/` — Database schema reference.
   - `testing/` — Testing conventions & commands.
   - Others as needed per project.
3. **`rules/`** — Agent-agnostic rule files (plain `.md`).
4. **`templates/`** — Scaffolds for common tasks:
   - `commit-template.md`, `pr-template.md`, and more.

## SKILL.md Format

Each skill lives in `skills/<name>/SKILL.md` with YAML frontmatter:

```yaml
---
name: my-skill
description: Use when <trigger>. <one-line behavior>.
version: 1.0.0
author: project-maintainers
license: MIT
metadata:
  agents:
    tags: [keyword, tags]
    related_skills: [other-skill]
---
```

Standard frontmatter fields:

| Field         | Required | Description                          |
| ------------- | -------- | ------------------------------------ |
| `name`        | Yes      | Lowercase-hyphenated skill name      |
| `description` | Yes      | Trigger condition + behavior (≤1KiB) |
| `version`     | Yes      | Semver                               |
| `author`      | Yes      | Author or project                    |
| `license`     | Yes      | SPDX identifier (MIT, Apache-2.0)    |
| `metadata`    | No       | Tool-specific metadata bush          |

## Rules Format

Rules in `rules/*.md` are plain markdown files describing agent conventions:

```markdown
# Rule Name

Applies to: [agent roles / tools]

## Behavior

Concrete instructions the agent should follow.

## Verification

How to check the rule was followed.
```

## Agent Tool Adapters

Each agent tool should map `.agents/` to its native format:

| Tool        | Native Dir                        | Adapter Strategy                    |
| ----------- | --------------------------------- | ----------------------------------- |
| OpenCode    | `.config/opencode/`               | Symlink or load `rules/` via config |
| Claude Code | `.claude/`                        | Read `.agents/rules/` at startup    |
| Cursor      | `.cursor/rules/`                  | Symlink `.agents/rules/`            |
| Copilot     | `.github/copilot-instructions.md` | Merge rules into single file        |

## License

`.agents/` standard and all skill files are **Apache-2.0 OR MIT** dual-licensed.
See `LICENSES/Apache-2.0.txt` and `LICENSES/MIT.txt` in the project root. Each
skill's frontmatter carries its SPDX identifier.
