<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: VN: character sprite roster per chat

**Status:** ⬜ Not Started
**Priority:** medium
**Epic:** Avatar Alpha Channel + VN Layering; Visual Novel Mode

## Summary

Per-chat sprite roster: registry of cast members present in a VN scene, each mapped to its sprite assets (base + per-emotion/mood variants from emotion-avatar pipeline), visibility, and active-slot assignment. Extends src/frontend/vn/portrait-manager.ts (currently single-portrait, role-based only). Data: roster state in chat VN settings / scene state; reuses asset linking. Acceptance: roster CRUD per character, emotion-variant resolution, active cast selection per scene, ownership checks on routes.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
