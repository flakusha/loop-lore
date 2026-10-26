<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: A community plugin named 'core' disables all five built-in tools

**Status:** Done
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-security-sandboxing

**Summary:**

The built-in tool namespace is the literal string 'core'. A community plugin whose manifest.name is 'core' registers a LoadedPlugin with origin 'community', which flips the shared enabled flag for that key to false, and the subsequent addTools('core', builtins) overwrites the key. isEnabled then reads false and enabledDefinitions filters every built-in tool out of getAllTools(), so all five built-ins vanish from the model-visible surface with no error.

Evidence read on dev:

- src/plugins/loader.ts:164-169 — community plugin registers; isPluginActive is false without an approval row, so setEnabled('core', false) runs.
- src/plugins/loader.ts:121 — registry.addTools('core', [builtins]) overwrites tools['core'].
- src/plugins/registry-store.ts:35-41 — isEnabled returns enabledMap.get('core') ?? name === 'core', which is now false.
- src/plugins/registry-store.ts:188-195 — enabledDefinitions drops the whole 'core' entry.
- src/plugins/registry-policy.ts:27-30 — assertPluginCanRegister allows 'core' when no LoadedPlugin entry exists; a community 'core' does have one, so the fallback never fires.

Fix: reject manifest.name 'core' (and every other reserved built-in namespace) at registration time.

Source: .tmp/longcat/review-plugins-services.md H5.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue a06afc7 (registry tip: 5734a81c2 Konstantin Fedotov Close issue)
