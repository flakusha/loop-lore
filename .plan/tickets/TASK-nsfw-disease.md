# TASK: NSFW-Disease Integration

**Epic:** NSFW Game Mechanics, Disease & Poison Systems
**Priority:** Medium
**Effort:** Medium
**Status:** Not Started
**Created:** 2026-07-28
**Cross-Mechanics Gap:** G9 (NSFW ↔ Disease)

## Summary

Pregnancy/reproduction references in NSFW system connect to Disease for reproductive health ailments (STDs, etc.).

## Background

Pregnancy/reproduction never references Disease for reproductive health ailments.

## Implementation

### Disease Transmission

NSFW encounters can transmit diseases:

| Disease     | Transmission     | Severity                 |
| ----------- | ---------------- | ------------------------ |
| Common cold | Physical contact | Mild                     |
| Flu         | Physical contact | Moderate                 |
| STD         | Unprotected NSFW | Severe                   |
| Pregnancy   | Unprotected NSFW | Permanent (adds new NPC) |

### Integration Points

- NSFW encounters without protection trigger disease check
- Disease system covers reproductive health
- Town healer can treat STD symptoms
- Pregnancy adds character (new NPC after gestation period)

## Acceptance Criteria

- [ ] NSFW encounters can transmit diseases
- [ ] Disease system covers reproductive health
- [ ] Protection reduces transmission risk
- [ ] Pregnancy results in new character after gestation
