<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

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
2. **`references/`** — Agent-agnostic reference files (plain `.md`):
   - `agent-rules.md` — Repo-local agent behavior rules.
   - `banned-patterns.md` / `recommendations.md` — Review rules.
   - `cli-config.md` — Development command reference.
3. **`skills/`** — One directory per skill, each holding a `SKILL.md`:
   `code-practices/`, `commit-message/`, `giwt-usage/`,
   `loop-lore-bookkeeping/`, `loop-lore-context/`, `loop-lore-db/`,
   `loop-lore-tasks/`, `native-issue/`, `sync-tickets/`,
   `worktree-merge/`.

## SKILL.md Format

Each skill lives in `skills/<name>/SKILL.md` with YAML frontmatter:

```yaml
---
name: my-skill
description: Use when <trigger>. <one-line behavior>.
version: 1.0.0
author: project-maintainers
license: Apache-2.0
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
| `version`     | No       | Semver                               |
| `author`      | No       | Author or project                    |
| `license`     | No       | SPDX identifier (Apache-2.0, MIT)    |
| `metadata`    | No       | Tool-specific metadata bush          |

## Reference Format

References in `references/*.md` are plain markdown files describing agent conventions:

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

| Tool        | Native Dir                        | Adapter Strategy                         |
| ----------- | --------------------------------- | ---------------------------------------- |
| OpenCode    | `.config/opencode/`               | Symlink or load `references/` via config |
| Claude Code | `.claude/`                        | Read `.agents/references/` at startup    |
| Cursor      | `.cursor/rules/`                  | Symlink `.agents/references/`            |
| Copilot     | `.github/copilot-instructions.md` | Merge references into single file        |

## License

`.agents/` files are **Apache-2.0** — each file's SPDX header says so, and
`REUSE.toml` annotates `.agents/**` with `Apache-2.0 OR MIT`. See
`LICENSES/Apache-2.0.txt` and `LICENSES/MIT.txt` in the project root. Each
skill's frontmatter carries its SPDX identifier.
