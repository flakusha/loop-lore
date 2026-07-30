## Reputation Data Flow Validation

### Objective

Enhance reputation data validation workflows with agent-assisted cross-system checks

### Epic Details

- **Name**: epic-reputation-validation
- **Priority**: High
- **Description**: Implement agent-based validation for reputation data flow across Faction/Social/NSFW systems

### Validation Scope

1. Cross-system data consistency checks
2. Reputation score propagation verification
3. Data transformation rule validation
4. Threshold compliance monitoring

### Implementation Path

1. Extend `check-parallel.sh` with reputation-specific validation
2. Integrate `cavecrew-investigator` for complex scenario analysis
3. Create dedicated script for reputation data flow checks

### Dependencies

- check-parallel.sh
- cavecrew-investigator agent
- Schema validation tools

### Status

- [ ] Script logic fixes in progress
- [ ] Epic documentation update
- [ ] Validation workflow integration

### Relevant Files

- /home/flak/git-ai/loop-lore/epics/reputation-validation.md
- /home/flak/git-ai/loop-lore/scripts/check-parallel.sh
- /home/flak/git-ai/loop-lore/.plan/epics/reputation-validation.md
