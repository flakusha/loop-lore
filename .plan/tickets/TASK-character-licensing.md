# TASK-2026-047: Character Licensing System

**Status**: open
**Priority**: low
**Labels**: feature, characters, licensing
**Assignee**:
**Epic**: EPIC-046 (Creative Studio)

### Description

Add optional licensing metadata to character templates. Supports CC0, CC-BY, CC-BY-SA, and custom licenses. Defaults to public domain.

### Licensing Reference

**Public Domain (CC0)**

- Purely AI-Generated: Works generated entirely by AI without significant human modification are uncopyrightable
- Tool Terms: Some AI generators explicitly release outputs as CC0
- Risk: Training data may be copyrighted (legally untested)

**Creative Commons (CC-BY, CC-BY-SA)**

- Derivative Works: Heavy human modifications may be copyrightable
- Attribution: Must state what parts are AI-generated vs human-authored

**Full Copyright (Human + AI Hybrid)**

- Significant Human Input: Backstory + visual concept + curation = copyrightable compilation
- Registration: US Copyright Office requires AI disclosure

### Acceptance Criteria

- [ ] Add `license` field to `CharacterTemplate` schema
- [ ] Add `meta.licensing` table to DB schema (optional)
- [ ] License included in exports but not imports by default
- [ ] Asset-level licensing for images/voice (per SD model terms)

### Notes

License field structure:

```typescript
interface CharacterLicense {
  compilation_license: string; // Overall license (CC0, CC-BY-4.0, etc.)
  copyright_holder?: string;
  assets?: Record<string, { license: string; creator?: string }>;
}
```

World-config gated — text-only worlds don't need this.
