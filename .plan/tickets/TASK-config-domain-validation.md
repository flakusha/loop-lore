# TASK: Per-Domain Config Validation

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** EPIC-2026-39 (Config File Separation)

## Summary

Validate each domain config file against its JSON schema at load time. Report validation errors with domain-specific context.

## Features

- Load JSON schema for each domain
- Validate domain config against schema on load
- Report validation errors with domain name and field path
- Fail-fast on invalid config
- Schema version tracking

## Acceptance Criteria

- [ ] Each domain config validates against its schema
- [ ] Validation errors include domain name and field path
- [ ] Invalid config prevents startup with clear error message
- [ ] Schema version tracked in each schema file

## Linked Epics

- `epic-config-file-separation.md`
