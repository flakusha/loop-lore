<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Housing-Companion Integration

**Epic:** epic-housing
**Priority:** Medium
**Effort:** Medium
**Status:** ⬜ Not Started
**Created:** 2026-07-28
**Cross-Mechanics Gap:** G10 (Housing ↔ Companion)

## Summary

Housing provides companion housing, pet rooms, and mount stables. Companion benefits from housing features.

> Owned by the standalone `epic-housing.md` umbrella epic (sub-domain: Companion Housing).

## Background

Housing has animal pens but never references Companion for stable mechanics, pet housing, mount stables.

## Implementation

### Companion Housing

- Pet rooms in housing for companion rest
- Horse stables for mount storage
- Animal pens for farm companions
- Comfort bonuses for housed companions

### Housing Features for Companions

| Housing Feature | Companion Benefit           |
| --------------- | --------------------------- |
| Pet bed         | +10% companion XP gain      |
| Stable          | Mount access, faster travel |
| Animal pen      | Farm animal products        |
| Kennel          | Guard companion bonus       |

## Acceptance Criteria

- [ ] Housing provides companion housing options
- [ ] Companions gain benefits from housing features
- [ ] Mount storage via stables
- [ ] Pet rooms speed up companion recovery
