<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Gate: validate configs example files against their schemas

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

The seven configs/templates domains ship as *.example.yaml and *.example.toml, but nothing parses or validates them. The loader discovers templates by bare name only (templates-loader/discovery.ts:12-28, template-expansion/discovery.ts:11-15, chat/service/templates.ts:88), so no file under src/ references .example.* at all - the examples are documentation only, and a user must rename the file to activate it.

With no gate, examples drift silently. This is how the content_rating enum mismatch shipped: the example was right, the validator was wrong, and nothing noticed.

Add a test that loads every configs/**\/*.example.* through the real loader against the committed schema. src/config/templates-loader.test.ts already has writeTemplateFile scaffolding. This single gate would also catch the avatar outfits block that is documented but unwired, the duplicated stare keyword, and the 142 expansion keywords/actions that never reach any config object.

Also add configs/templates/README.md stating the rename-to-activate rule once at the top of the directory.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
