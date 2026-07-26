# TASK: Character Specification & Unified API

**Epic:** `epic-character-spec.md`
**Status:** In Progress
**Priority:** High
**Effort:** High

## Goal

Define the unified character specification for loop-lore covering:
mandatory/optional fields, multi-level object descriptions, format
conversion logic, API design with validation modes, review workflow,
content rating propagation, impersonation rules, migration system,
and multi-language support.

## Tasks

### 1. Spec Document

- [x] Create `docs/spec/character-spec.md` with unified character specification
- [ ] Review and finalize with team
- [ ] Publish JSON Schema at `schemas/character-card.json`

### 2. Mandatory/Optional Fields & Multi-Level Descriptions

- [ ] Define `CanonicalCharacter` type in `src/characters/spec.ts`
- [ ] Implement `extensions` map for multi-level object descriptions
- [ ] Add validation for mandatory fields (name, description, personality)
- [ ] Add validation for optional fields with constraints
- [ ] Unit tests for field validation

### 3. Format Conversion Logic

- [ ] Treat YAML and TOML as first-class storage formats
- [ ] Update `src/characters/parser.ts` to handle YAML/TOML as storage formats
- [ ] Update `src/characters/normalizers/yaml.ts` and `normalizers/toml.ts`
- [ ] Add `data_source_format` column to `actors` table (migration needed)
- [ ] Update export routes to support YAML/TOML as native formats
- [ ] CHARX V3 bundles async processing (202 Accepted + job polling)

### 4. API Validation Modes

- [ ] Implement strict validation mode (default)
- [ ] Implement relaxed validation mode (configurable)
- [ ] Add `X-Validation-Mode` header support
- [ ] Add validation middleware to character routes
- [ ] Unit tests for both validation modes

### 5. Review Workflow

- [ ] Define review states and transitions
- [ ] Implement review API endpoints (submit, approve, reject, log)
- [ ] Add role-based permissions (Admin, Moderator, User, LLM)
- [ ] Unit tests for review state machine

### 6. Content Rating Propagation

- [ ] Implement age-based content rating enforcement
- [ ] Add chat-level content rating checks
- [ ] Add user age verification integration
- [ ] Unit tests for content rating propagation

### 7. Impersonation Rules

- [ ] Implement private chat impersonation limits (1 actor per user)
- [ ] Implement group chat impersonation rules
- [ ] Add de-impersonation on chat leave
- [ ] Add de-impersonation API endpoint
- [ ] Unit tests for impersonation rules

### 8. Migration System

- [ ] Implement version migration logic (auto-fill, readiness checks)
- [ ] Add migration API endpoints
- [ ] Add migration status tracking
- [ ] Unit tests for migration logic

### 9. Multi-Language Support

- [ ] Implement translation fields in character spec
- [ ] Add locale configuration
- [ ] Implement locale fallback logic
- [ ] Unit tests for translation fields

### 10. World/Style Validations

- [ ] Implement world validation rules structure
- [ ] Implement style validation rules structure
- [ ] Add opt-in feature flags
- [ ] Unit tests for world/style validation rules

### 11. Game Rules / Mechanics Config

- [ ] Define plugin bundle preset structure
- [ ] Implement bundle loading at startup
- [ ] Add character-plugin integration
- [ ] Unit tests for bundle loading

### 12. LSP/IDE Support

- [ ] Create JSON Schema at `schemas/character-card.json`
- [ ] Verify YAML/TOML LSP compatibility
- [ ] Document LSP setup for frontend editors

### 13. Unit/E2E Coverage

- [ ] Unit tests for all new modules (target: 80%+ coverage)
- [ ] E2E tests for character creation, import, export, review workflow
- [ ] Integration tests for full pipeline

## Acceptance Criteria

1. `docs/spec/character-spec.md` is the canonical character specification
2. All mandatory fields are validated in strict mode
3. YAML and TOML are first-class storage formats
4. API supports both strict and relaxed validation modes
5. Review workflow has 4 roles with defined transitions
6. Content rating is propagated from character to chat context
7. Impersonation rules are enforced in private and group chats
8. Migration system auto-fills fields and reports readiness
9. Multi-language support with locale fallback
10. World/style validation rules are configurable
11. Plugin bundle presets work via config files
12. JSON Schema is published for LSP/IDE support
13. Unit tests cover all new modules (80%+ coverage)
