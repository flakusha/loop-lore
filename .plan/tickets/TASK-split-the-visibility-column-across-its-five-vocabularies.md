<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Split the visibility column across its five vocabularies

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

`visibility` is a TEXT column on 12 tables carrying five unrelated vocabularies. Measured on the built schema (migrations -> schema):

- owner visibility, default `private`: actors, assets, chats, worlds
- publication status, default `public`: blog_posts
- message visibility, default `visible`: messages
- item visibility, default `visible`: world_items
- GM-note reveal, default `user_visible`: shadow_notes (added by 002)
- JSON array (not a scalar), default `[]`: character_internal_traits
- unvalidated/nullable: chat_setup_templates, admin_character_overrides.visibility_override
- thinking-display policy, default `hidden`: chats.thinking_visibility

Rename by meaning, following the same pattern as the `data_version`/`format_version` split: `owner_visibility`, `message_visibility`, `item_visibility`, `reveal_state`, `publication_status`, `visible_to`. Confirm each table's enum first (`MessageVisibility`, `ItemVisibility`), and confirm whether `chat_setup_templates.visibility` and `admin_character_overrides.visibility_override` are actually read before renaming or deleting them.

Deliberately deferred from the version/hash rename pass: 12 tables across 6 subsystems, and each needs its enum vocabulary confirmed first.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
