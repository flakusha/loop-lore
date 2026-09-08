<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Create/item generation discoverability: document subcommands in help and palette

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

/create char|loc|world|item all work through the gated pipeline, but users cannot discover them: /help (src/assistant/commands/help.ts) lists bare command names only (- /create with no subcommand or kind hints), and the command palette hydrates from the same name-only registry (GET /api/commands). Confirm the assistant flow exposes item + other generation capability by adding per-command usage blurbs (at minimum /create <char|loc|world|item> <description>) to /help output and the /api/commands descriptors, reusing the existing descriptionKey/i18n catalog pattern. Related: TASK-assistant-capability-disclosure (role-aware disclosure) and WIRE-assistant-command-palette-stale-static-list. Acceptance: /help shows /create subcommands; palette entry for create carries a description; item generation explicitly mentioned.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
