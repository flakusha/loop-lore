# TASK: i18n Reconciliation Script

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Small
**Epic:** epic-i18n

## Summary

Create a script to validate and reconcile locale files against `en.json`. Detects missing keys, extra keys, structural mismatches, and can auto-fix discrepancies.

## Problem

With 10 locale files and 301+ keys each, manual synchronization is error-prone:

- Keys added to `en.json` may be missing from other locales
- Keys removed from `en.json` may linger in other locales
- Nested structure may drift between locales
- No CI gate to catch drift

## Solution

A Bun script (`scripts/i18n-reconcile.ts`) that:

1. **Reads** `en.json` as source of truth
2. **Compares** each locale file against `en.json`
3. **Reports** discrepancies (missing, extra, type mismatches)
4. **Auto-fixes** (optional `--fix` flag) by:
   - Adding missing keys with English fallback values
   - Removing extra keys not in `en.json`
   - Preserving existing translations for keys that exist in both

## Usage

```bash
# Check only (report discrepancies)
bun run scripts/i18n-reconcile.ts

# Auto-fix (add missing, remove extra)
bun run scripts/i18n-reconcile.ts --fix

# Check specific locale
bun run scripts/i18n-reconcile.ts --locale ja

# CI mode (exit 1 if discrepancies found)
bun run scripts/i18n-reconcile.ts --ci
```

## Output Format

```
i18n Reconciliation Report
═══════════════════════════

en.json: 301 keys (source of truth)

ja.json:
  ✅ 301/301 keys match
  ⚠️  2 missing keys:
    - tooltips.viewChats
    - help.settings.theme
  ℹ️  1 extra key (not in en.json):
    - legacy.oldKey

de.json:
  ✅ 301/301 keys match

Summary: 9/10 locales complete, 2 discrepancies found
```

## Implementation

### Script Structure

```ts
// scripts/i18n-reconcile.ts
import { readdirSync, readFileSync, writeFileSync, } from "fs";
import { join, } from "path";

interface Discrepancy {
  locale: string;
  type: "missing" | "extra" | "type_mismatch";
  key: string;
  expected?: unknown;
  actual?: unknown;
}

function flatten(obj: Record<string, unknown>, prefix = "",): Record<string, unknown> {
  // Flatten nested object to dot-notation keys
}

function compare(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
): { missing: string[]; extra: string[]; typeMismatch: string[] } {
  // Compare flattened key sets
}

function fix(
  sourcePath: string,
  targetPath: string,
  discrepancies: Discrepancy[],
): void {
  // Add missing keys (with English fallback)
  // Remove extra keys
  // Preserve existing translations
}
```

### CI Integration

Add to `.github/workflows/ci.yml`:

```yaml
- name: Check i18n consistency
  run: bun run scripts/i18n-reconcile.ts --ci
```

### package.json Script

```json
{
  "scripts": {
    "i18n:check": "bun run scripts/i18n-reconcile.ts",
    "i18n:fix": "bun run scripts/i18n-reconcile.ts --fix"
  }
}
```

## Acceptance Criteria

- [ ] Script detects missing keys (locale has fewer keys than en.json)
- [ ] Script detects extra keys (locale has keys not in en.json)
- [ ] Script detects type mismatches (key is string in en, object in locale)
- [ ] `--fix` flag adds missing keys with English fallback values
- [ ] `--fix` flag removes extra keys
- [ ] `--fix` preserves existing translations
- [ ] `--ci` flag exits with code 1 if discrepancies found
- [ ] `--locale` flag limits check to specific locale
- [ ] Script runs in <2 seconds for all 10 locales
- [ ] `bun run check` passes

## Files to Create

- `scripts/i18n-reconcile.ts` — Main script (new)
- `package.json` — Add `i18n:check` and `i18n:fix` scripts

## Files to Modify

- `.github/workflows/ci.yml` — Add i18n consistency check step

## Related

- `src/i18n/locale-loader.ts` — Existing locale loading logic
- `src/public/locales/*.json` — All 10 locale files
- `TASK-i18n-locale-completion.md` — Phase 1 (completed)
